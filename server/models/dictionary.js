const fs = require('fs');

// let englishToYoruba = {};
// let yorubaToEnglish = {};
// let translate = {english: englishToYoruba,
//                     yoruba: yorubaToEnglish};
// let wordsByCategory = {};
// let dictionary = {lookup: translate, byCategory: wordsByCategory};

function init() {
    let englishToYoruba = {};
    let yorubaToEnglish = {};
    let wordsByCategory = {};
    const dir ='./server/resources/words/';
    const filenames = fs.readdirSync(dir);
    for (let filename of filenames) {
        const data = fs.readFileSync(dir + filename);
        let lines = data.toString().split(/[\r\n]/g);
        const category = lines[0];
        let words = [];
        for (let idx = 0; idx < lines.length; idx++) {
            if (0 === idx) continue;
            let line = lines[idx];
            let word = line.split(',');
            let english = word[0];
            let yoruba = encodeYoruba(word[1]);
            if (!isValid(english) || !isValid(yoruba)) continue;
            englishToYoruba[english] = yoruba;
            yorubaToEnglish[yoruba] = english;
            words.push([english, yoruba]);
        }
        wordsByCategory[category] = words;
    }
    let translate = {english: englishToYoruba,
        yoruba: yorubaToEnglish};
    return {lookup: translate, byCategory: wordsByCategory};
}

function isValid(word) {
    if (typeof word === 'undefined') return false;
    return (word.length !== 0);
}

function encodeYoruba(word) {
    if (!isValid(word)) return '';
    return word.replace(/(\[.*?])/g, htmlCodeConvert);
}

function htmlCodeConvert(code) {
    const dot = code.charAt(1) === '.';
    const base = code.charAt(2);
    let accent = code.length > 4 ? code.charAt(3) : '_';
    let ret = '';
    accent = '+uU\'^'.includes(accent) ? '+' : '-dD`v'.includes(accent) ? '-' : '_';
    if (dot) {
        ret = base === 'E' ? '&#7864;' :
            base === 'e' ? '&#7865;' :
                base === 'O' ? '&#7884;' :
                    base === 'o' ? '&#7885;' :
                        base === 'S' ? '&#7778;' :
                            base === 's' ? '&#7779;' :
                                base === 'I' ? '&#7882;' :
                                    base === 'i' ? '&#7883;' :
                                        base === 'U' ? '&#7908;' :
                                            base === 'u' ? '&#7909;' :
                                                base === 'A' ? '&#7840;' :
                                                    base === 'a' ? '&#7841;' :
                                                        (base + '&#803;');
        ret += (accent === '+') ? '&#x0301;' :
            (accent === '-') ? '&#x0300;' : '';
    } else {
        ret = '&' + base;
        ret += (accent === '+') ? 'acute;' :
            (accent === '-') ? 'grave;' : ';';
    }
    return ret;
}

let dictionary = init();
Object.freeze(dictionary);
module.exports = dictionary;