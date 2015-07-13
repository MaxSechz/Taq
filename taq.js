(function() {
    'use strict';

    var templates = {},
        slice = Function.prototype.call.bind(Array.prototype.slice),
        macros = [];

    class DataTemplate {
        constructor (strings, values) {
            this.strings = strings;
            this.values = values;
        }

        toString () {
            return taq.prime.apply(taq, [this.strings].concat(this.values));
        }
    }

    function taq (strings) {
        return new DataTemplate(strings, slice(arguments, 1));
    }

    function runMacros(p) {
        for (var i = macros.length - 1; i > -1; i--) {
          macros[i](p);
        }
    }

    taq.prime = function (strings) {
        var values = slice(arguments, 1);

        return strings.reduce(function (memo, currentString, index, stringsArray) {
            var currentValue = values[index];

            // p is for pointer
            runMacros({
              get string() { return currentString; },
              set string(newVal) { return currentString = newVal;  },
              get value() { return currentValue; },
              set value(newVal) { return currentValue = newVal;  },
              get nextString() { return stringsArray[index + 1]; },
              set nextString(newVal) { return stringsArray[index + 1] = newVal;  },
              get index() { return index; },
              get strings() { return stringsArray; },
              get values() { return values; }
            });

            return memo + currentString + currentValue;
        }, '');
    };

    taq.partial = function (name, data) {
        return Taq(name).bind(data)(taq);
    };

    window.Taq = function (tempName, tempFunc) {
        if (arguments.length > 1) {
            return templates[tempName] = tempFunc;
        } else {
            return Taq.template(templates[tempName]);
        }
    };

    Taq.template = function (funToTemplate) {
        return function (data) {
            return taq.prime`${funToTemplate.bind(data)(taq)}`;
        };
    };

    Taq.addMacro = function (macro) {
        macros.push(macro);
    };

    Taq.addMacro(function (p) {
        if (typeof p.value === "undefined") { p.value = '';}
    });

    Taq.addMacro(function (p) {
      var whitespace, newStrings = [''];

      if( Array.isArray(p.value) ) {
          whitespace = p.string.match(/\s*$/)[0];
          while ( newStrings.length < p.value.length ) newStrings.push(whitespace);
          p.value = new DataTemplate(newStrings, p.value);
      }
    });
}());
