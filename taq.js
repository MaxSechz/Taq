(function() {
    'use strict';

    var taq, escape,
        templates = {},
        slice = Function.prototype.call.bind(Array.prototype.slice),
        isArray = Array.isArray,
        macros = [],
        escapeMap = {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#x27;',
              '`': '&#x60;'
        },
        regSource = '(?:' + Object.keys(escapeMap).join('|') + ')',
        testReg = new RegExp(regSource),
        replaceReg = new RegExp(regSource, 'g'),
        getResult = function (context, property) {
            return typeof context[property] === 'function' ? context[property]() : context[property];
        };

    function DataNode(strings, values) {
        this.strings = strings;
        this.values = values;
    }

    DataNode.prototype.toString = function () {
        return prime.apply(null, [this.strings].concat(this.values));
    };

    function EscapedNode(strings, values) {
        this.strings = strings;
        this.values = values;
    }

    EscapedNode.prototype.escape = function (unescaped) {
        var mapper = function (match) { return this[match]; }.bind(escapeMap);
        return testReg.test(unescaped) ? unescaped.replace(replaceReg, mapper) : unescaped;
    };

    EscapedNode.prototype.toString = function () {
        var escaper = function (item) { return this.escape(item.toString()); }.bind(this),
        values = this.values.map(escaper);

        return prime.apply(null, [this.strings].concat(values));
    };

    function IfNode(condition, result) {
        this.condition = condition;
        this.result = result;
    }

    IfNode.prototype.else = function (condition, result) {
        this.tail ? this.tail.addNode(condition, result) : this.addNode(condition, result);
        return this;
    };

    IfNode.prototype.addNode = function (condition, result) {
        if ( this.tail ) {
            this.tail.addNode(condition, result);
        } else {
            this.tail = new IfNode(condition, result);
        }
    };

    IfNode.prototype.toString = function () {
        var truthy = getResult(this, 'condition');
        if ( truthy ) {
            return this.result ? getResult(this, 'result').toString() : truthy.toString();
        } else {
            return this.tail ? this.tail.toString() : '';
        }
    };

    function prime (strings) {
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
    }

    function runMacros(p) {
        for (var i = macros.length - 1; i > -1; i--) {
          macros[i](p);
        }
    }

    function Taq() {
        this.unescape();
    }

    Taq.prototype.template = function (name) {
        return function (data) {
            return prime(['',''], taq.partial(name, data));
        };
    };

    Taq.prototype.addTemplate = function (name, template) {
        return templates[name] = template;
    }

    Taq.prototype.addMacro = function (macro) {
        macros.push(macro);
    };

    Taq.prototype.escape = function () {
        escape = true;
    };

    Taq.prototype.unescape = function () {
        escape = false;
    };

    function TaqHelper(){}
    TaqHelper.prototype = {
        danger: function (strings) {
            return new DataNode(isArray(strings) ? strings : [strings], slice(arguments, 1));
        },
        safe: function (strings) {
            return new EscapedNode(isArray(strings) ? strings : [strings], slice(arguments, 1));
        },
        partial: function (name, data) {
            return templates[name].bind(data)( escape ? taq.safe : taq.danger );
        },
        if: function (condition, result) {
            return new IfNode(condition, result);
        }
    };

    Object.keys(TaqHelper.prototype).forEach(function (targetFunName, index, taqKeys) {
        var targetFun = TaqHelper.prototype[targetFunName];

        taqKeys.forEach(function (funName) {
            targetFun[funName] = TaqHelper.prototype[funName];
        });
    });

    taq = new TaqHelper();
    window.Taq = new Taq();

    window.Taq.addMacro(function (p) {
        if (typeof p.value === "undefined" && (p.index + 1 >= p.values.length) ) {
           p.value = '';
        }
    });

    window.Taq.addMacro(function (p) {
      var whitespace, newStrings = [''];

      if( isArray(p.value) ) {
          whitespace = p.string.match(/\s*$/)[0];
          while ( newStrings.length < p.value.length ) newStrings.push(whitespace);
          p.value = new DataNode(newStrings, p.value);
      }
    });
}());
