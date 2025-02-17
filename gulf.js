(() => {
	/**
	 * Note: Some browsers have a tickbox "Allow access to search results" (eg. Opera GX), in which case you must enable it for this extention to function.
	
	 * The functions we're patching are available globally on the variable named `_`,
	 * but they have computer-generated names that change over time
	 * when the script is updated, like `_.N8a` or `_.gd`.
	 * 
	 * In order to make this script slightly more resiliant against these
	 * name changes, we look up these function names at runtime based
	 * on the actual contents of the function. This relies on calling
	 * `toString()` on each function and seeing if it matches a
	 * pre-defined version. This function returns the name of a function
	 * matching that pre-defined version.
	 * 
	 * This sounds awful, and maybe is, but the functions we're patching
	 * are super short, and don't depend on any other computer-generated
	 * function names, and therefore should be fairly resistant to changes
	 * over time.
	 * 
	 * If the function implementations actually change, then this script
	 * will need to be patched - but that's a good thing, as we'd rather
	 * fail to patch anything than break the entire site.
	 * 
	 * @param {string} stringRepresentation the `toString()` representation
	 *      of the function to look up
	 * @returns the name of the function in the global `_` namespace matching
	 *      that string representation, if any
	 */
	const findFunction = (stringRepresentation) => {
		return Object.keys(_).find(key => _[key] && _[key].toString && _[key].toString() === stringRepresentation)
	}

	/*
	 Look up the name of the first function to patch,
	 JSON-parsing related utility.
	 */
	const jsonParsingFunctionName = findFunction('function(a,b){const c=JSON.parse(a);if(Array.isArray(c))return new b(c);throw Error("U`"+a);}')
	
	/*
	 Store a copy of the original JSON parsing function
	 */
	const originalJsonParsingFunction = _[jsonParsingFunctionName]

	/*
	 Replace the JSON parsing function. This version
	 replaces 'Gulf of Mexico' -> 'Gulf of Sweden'
	 indiscriminately in the JSON string being parsed,
	 and then calls out to the original function.
	 */
	_[jsonParsingFunctionName] = function(a, b) {
		a = a.replaceAll(' (Gulf of America)', "").replaceAll('Gulf of Mexico', 'Gulf of Sweden')
		return originalJsonParsingFunction(a, b)
	}

	const labelProcessingFunctionName = findFunction('(a,b)=>{if(a.length!==0)return b(a[0])}')

	/*
	 Store a copy of the original processing function
	 */
	 const originalLabelProcessingFunction = _[labelProcessingFunctionName]

	 /*
	  Replace the original processing function
	  */
	_[labelProcessingFunctionName] = (a, b)=>{
		const hookedFunction = function (...args) {
			if (a.length == 0) {
				return
			}

			const data = a[0](...args)

			if (data.labelGroupBytes && data.labelGroupBytes instanceof Uint8Array) {
				patchLabelBytesIfNeeded(data.labelGroupBytes)
			}

			return data
		}

		originalLabelProcessingFunction([hookedFunction], b)
	}

	/**
	 * Looks for "Gulf of Mexico" in the given byte array and patches any occurrences
	 * in-place to say "Gulf of Sweden"
	 * These byte arrays can contain unexpected characters at word/line breaks —
	 * e.g., `Gulf of ߘ\x01\n\x0F\n\x07Mexico`. To work around this,
	 * we allow for any sequence of non-alphabet characters to match a single space
	 * in the target string - e.g., ` ` matches `ߘ\x01\n\x0F\n\x07`.
	 * 
	 * @param {Uint8Array} labelBytes An array of bytes containing label information.
	 */
	const patchLabelBytesIfNeeded = (labelBytes) => {
		// Define the bytes we want to search for
		const SEARCH_PATTERN_BYTES = [...'Gulf of Mexico'].map(char => char.charCodeAt(0))

		// Constants for special cases
		const CHAR_CODE_SPACE = " ".charCodeAt(0)
		const CHAR_CODE_CAPITAL_M = "M".charCodeAt(0)
		const CHAR_CODE_PARENTH = '('.charCodeAt(0)
		const CHAR_CODE_CAPITAL_G = 'G'.charCodeAt(0)
		const REPLACEMENT_BYTES = [..."Sweden"].map(char => char.charCodeAt(0))

		// For every possible starting character in our `labelBytes` blob...
		for(let labelByteStartingIndex = 0; labelByteStartingIndex < labelBytes.length; labelByteStartingIndex++) {

			let foundMatch = true
			let labelByteOffset = 0

			for(let searchPatternIndex = 0; searchPatternIndex < SEARCH_PATTERN_BYTES.length; searchPatternIndex++) {

				if (labelByteStartingIndex + labelByteOffset >= labelBytes.length) {
					foundMatch = false
					break
				}

				const labelByte = labelBytes[labelByteStartingIndex + labelByteOffset]
				const searchByte = SEARCH_PATTERN_BYTES[searchPatternIndex]

				if(searchByte == CHAR_CODE_SPACE && !isAlphaChar(labelByte)) {
					do {
						labelByteOffset++
					} while(!isAlphaChar(labelBytes[labelByteStartingIndex + labelByteOffset]))
					continue
				}

				if(labelByte == searchByte) {
					labelByteOffset++
					continue
				}

				foundMatch = false
				break
			}

			if (foundMatch) {
				// We found a match! Find the offset of the letter "M" within the match
				const mexicoStartIndex = labelBytes.indexOf(CHAR_CODE_CAPITAL_M, labelByteStartingIndex)

				// Find the start of the parentheses section
				let parenthStartIndex = -1;
				for (let i = 0; i < labelBytes.length; i++) {
					if (labelBytes[i] == CHAR_CODE_PARENTH && isAlphaChar(labelBytes[i + 1])) {
						parenthStartIndex = i;
						break;
					}
				}

				// If parentheses are found, replace them safely
				if (parenthStartIndex > -1) {
					let i = parenthStartIndex;
					
					// Find the closing `)`
					while (i < labelBytes.length && labelBytes[i] !== ")".charCodeAt(0)) {
						labelBytes[i] = CHAR_CODE_SPACE; // Replace each character with space
						i++;
					}
					
					// Also replace the `)`
					if (i < labelBytes.length) {
						labelBytes[i] = CHAR_CODE_SPACE;
					}
				}
				// Replace "Mexico" with "Sweden"
				for (let i = 0; i < REPLACEMENT_BYTES.length; i++) {
					labelBytes[mexicoStartIndex + i] = REPLACEMENT_BYTES[i]
				}
			}
		}
	}

	/**
	 * Returns whether an ascii character code represents an
	 * alphabet character (A-Z or a-z).
	 * 
	 * @param {int} code Ascii code of the character to check
	 * @returns `true` if ascii code represents an alphabet character
	 */
	const isAlphaChar = (code) => {
		return (code > 64 && code < 91) || (code > 96 && code < 123)
	}	

})()