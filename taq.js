(function() {
    'use strict';

    var taq, polyfillTaq, escape, rope,
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
        },
        rawIsPolyfilled = function () {
            return String.raw.toString() !== "function raw() { [native code] }";
        },
        objectMap = function (obj, fun) {
            return Object.keys(obj).map(fun);
        };

    rope = (function() {
        if (!String.raw) {
            String.raw = function (strings) {
                var values = slice(arguments, 1);

                return strings.reduce(function (memo, currentString, index, stringsArray) {
                    return memo + currentString + (values[index] ? values[index] : '');
                }, '');
            };
        }

        var inherit = function(parent, protoMeths) {
            var child, Surrogate;

            if ( protoMeths.hasOwnProperty('constructor') ) {
              child = protoMeths.constructor;
            } else {
              child = function(){ return parent.apply(this, arguments); };
            }

            Surrogate = function(){ this.constructor = child; };
            Surrogate.prototype = parent.prototype;
            child.prototype = new Surrogate();

            Object.keys(protoMeths).forEach(function (key, index, protoKeys) {
                if (key !== 'constructor') {
                    child.prototype[key] = protoMeths[key];
                }
            });

            child.__super__ = parent.prototype;

            return child;
        };

        var TopNode = inherit({}, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/function/g];
            },

            addNode: function (node) {
                this.children.push(node);
                this.resetRegexes(node.lastIndex);
                this.lastIndex = node.lastIndex;
            },

            match: function (string) {
                var result;

                this.regexes.forEach(function (regex) {
                    var match = regex.exec(string);

                    if ( this.isValid(match, result) ) {
                        result = result || {};
                        result.index = match.index;
                        result.lastIndex = regex.lastIndex;
                    }
                }.bind(this));

                return result;
            },

            parse: function (string, startingIndex) {
                var delimiter, childNode, match, plainNode;
                this.resetRegexes(startingIndex || 0);
                this.lastIndex = startingIndex || 0;

                while ( (match = this.match(string)) ) {
                    delimiter = string.slice(match.index, match.lastIndex);
                    plainNode = this.plainNodeFor(string.slice(this.lastIndex, match.index), match.lastIndex);
                    this.addNode(plainNode);

                    if ( this.isClosing(delimiter) ) { this.close = delimiter; break; }

                    childNode = this.nodeFor(delimiter);
                    childNode.parse(string, match.lastIndex);
                    this.addNode(childNode);
                }
            },

            resetRegexes: function (lastIndex) {
                this.regexes.forEach(function (regex) {
                    regex.lastIndex = lastIndex;
                });
            },

            isValid: function (match, result) {
                 return match && (!result || result.index > match.index);
            },

            nodeFor: function (delim) {
                return new FunctionNode(delim);
            },

            plainNodeFor: function (text, lastIndex) {
                var node = new String(text);
                node.lastIndex = lastIndex;
                return node;
            },

            isClosing: function (delim) {
                return delim === null;
            },

            toString: function () {
                return this.children.join('');
            }
        });

        var PlainNode = inherit({}, {
            constructor: function (text) {
                this.text = text;
            },

            toString: function () {
                var reducer = function (memo, item, idx, strings) {
                    var len = strings.length,
                        lastChar = idx + 1 === len ? '' : '+';

                    if ( len === 1 ) {
                        item ? memo.push("'" + item + "'" + lastChar) : memo.push("''");
                    } else {
                        item ? memo.push("'\\n" + item + "'" + lastChar) : memo.push(item);
                    }

                    return memo;
                };

                return this.text
                            .replace(/'/g, "\\'")
                            .split(/\n/g)
                            .reduce(reducer, [])
                            .join("\n");
            }
        });


        var FunctionNode = inherit(TopNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/\w*\s*`/g, /`/g, /;\s*\}$/g];
            },

            nodeFor: function (delimiter) {
                return new BacktickNode(delimiter);
            },

            toString: function () {
                return this.delim + this.children.join('') + this.close;
            },

            isClosing: function (delim) {
                return /;\s*\}$/g.test(delim);
            }
        });

        var BacktickNode = inherit(TopNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/\$\{/g, /`/g];
            },

            nodeFor: function (delimiter) {
                return new StringExpressionNode(delimiter);
            },

            toString: function () {
                var tagFun,
                    childrenString = this.children.join(',');

                if (this.delim === "`") {
                    return "[" + childrenString + "].join('')";
                } else {
                    tagFun = /\w*/g.exec(this.delim);
                    return this.delim.slice(0, -1).replace(tagFun, tagFun + '(') + childrenString + ')';
                }
            },

            plainNodeFor: function (text, lastIndex) {
                var node = new PlainNode(text);
                node.lastIndex = lastIndex;
                return node;
            },

            isClosing: function (delim) {
                return delim === '`';
            }
        });

        var QuoteNode = inherit(TopNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
            },

            isValid: function (match, result) {
                return QuoteNode.__super__.isValid.call(this, match, result) && match.input[match.index - 1] !== '\\';
            },

            isClosing: function (delimiter) {
                return this.delim === delimiter;
            }
        });

        var SingleQuoteNode = inherit(QuoteNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/'/g];
            },

            toString: function () {
                return "'" + this.children.join('') + "'";
            }
        });

        var DoubleQuoteNode = inherit(QuoteNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/"/g];
            },

            toString: function () {
                return '"' + this.children.join('') + '"';
            }
        });

        var StringExpressionNode = inherit(TopNode, {
            constructor: function (delimiter) {
                this.delim = delimiter;
                this.children = [];
                this.regexes = [/\w*`/g, /`/g, /\{/g, /'/g, /"/g, /\}/g];
            },

            nodeFor: function (delim) {
                switch(delim) {
                    case '{':
                        return new ObjectNode(delim);
                    case "'":
                        return new SingleQuoteNode(delim);
                    case '"':
                        return new DoubleQuoteNode(delim);
                    default:
                        return new BacktickNode(delim);
                }
            },

            toString: function () {
                return this.children.join('');
            },

            isClosing: function (delim) {
                return delim === '}';
            }
        });

        var ObjectNode = inherit(StringExpressionNode, {
            toString: function () {
                return '{' + this.children.join('') + '}';
            }
        });

        return function ( funToCompile ) {
            var compile = function (func) {
                var tree = new TopNode();
                tree.parse(funToCompile.toString());
                var fun = tree.toString();
                return new Function('taq', fun.slice(fun.search(/\{/) + 1, -1));
            };

            if ( rawIsPolyfilled() ) {
                return compile(funToCompile);
            } else {
                return funToCompile;
            }
        };
    }());

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

    function Taq() { this.unescape(); }
    Taq.prototype = {
        template: function (name) {
            return function (data) {
                var targetTaq = rawIsPolyfilled() ? polyfillTaq : taq;
                return prime(['',''], targetTaq.partial(name, data));
            };
        },
        addTemplate: function (name, template) { return templates[name] = rope(template); },
        addMacro: function (macro) { macros.push(macro); },
        escape: function () { escape = true; },
        unescape: function () { escape = false; }
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
            return templates[name].bind(data)(escape ? this.safe : this.danger);
        },
        if: function (condition, result) {
            return new IfNode(condition, result);
        }
    };

    function polyfillWrapper(fun) {
        return function () {
            var strings = [],
                values = [],
                both = [strings, values],
                index = 0;

            while( (strings.length + values.length) < arguments.length ) {
                both[index % 2].push(arguments[index++]);
            }

            return fun.apply(null, [strings].concat(values));
        };
    }

    function PolyfillTaqHelper(){}
    PolyfillTaqHelper.prototype = {
        danger: polyfillWrapper(TaqHelper.prototype.danger),
        safe: polyfillWrapper(TaqHelper.prototype.safe),
        partial: TaqHelper.prototype.partial,
        if: TaqHelper.prototype.if
    };

    function allForOne(obj) {
        objectMap(obj, function (propName, index, props) {
            var targetProp = obj[propName];

            props.forEach(function (prop) {
                targetProp[prop] = obj[prop];
            });
        });
    }
    allForOne(TaqHelper.prototype);
    allForOne(PolyfillTaqHelper.prototype);

    taq = new TaqHelper();
    polyfillTaq = new PolyfillTaqHelper();
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
