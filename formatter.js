(function($) {
    "use strict";
    /**
    * Cross browser routin for getting selected range/cursor position
    */
    function getElementSelection(that) {
        var position = {};
        if (that.selectionStart === undefined) {
            that.focus();
            var select = document.selection.createRange();
            position.length = select.text.length;
            select.moveStart('character', -that.value.length);
            position.end = select.text.length;
            position.start = position.end - position.length;
        } else {
            position.start = that.selectionStart;
            position.end = that.selectionEnd;
            position.length = position.end - position.start;
        }
        return position;
    }

    function setElementSelection(that, start, end) {
        if (that.selectionStart === undefined) {
            that.focus();
            var r = that.createTextRange();
            r.collapse(true);
            r.moveEnd('character', end);
            r.moveStart('character', start);
            r.select();
        } else {
            that.selectionStart = start;
            that.selectionEnd = end;
        }
    }

    function autoGroup(val, thousandseparator) {
        var digitalGroup = /(\d)((\d{3}?)+)$/;
        if (val) {
            var groups = val.split('.');
            while (digitalGroup.test(groups[0])) {
                groups[0] = groups[0].replace(digitalGroup, '$1' + thousandseparator + '$2');
            }
            val = groups[0] + (groups.length > 1 ? '.' + groups[1] : '');
        }
        return val;
    }

    function unformat(val, thousandseparator) {
        return val.split(thousandseparator).join('');
    }

    /**
     * форматтер для ui-компонентнов
     * @param  {String} type    тип форматтера. Поддерживаемые типы:
     *                          'oneline_textarea' - для textarea, для которых нужно запретить переход на новую строку
     *                          'number' - для ввода в поле только числового значения
     *                          'amount' - для ввода сумм
     * @param  {Object} options дополнительные настройки для форматтера
     *                          keyset - список поддерживаемых кодов символов
     *                          reverse - <code>true</code> если keyset нужно исключать
     *                          maxlength - ограничение на длину поля
     *                          decimallength - кол-во знаков после запятой (только для типа 'amount')
     *                          thousandseparator - разделитель между тысячами
     */
    var def = {
        'oneline_textarea': {
            keyset: [10,13],
            reverse: true,
            maxlength: 160,
            trimonblur: true
        },
        'number': {
            keyset: [48,49,50,51,52,53,54,55,56,57],
            reverse: false
        },
        'amount': {
            keyset: [48,49,50,51,52,53,54,55,56,57],
            reverse: false,
            maxlength: 10,
            decimallength: 2,
            thousandseparator: ' '
        },
        'phone': {
            mask: '+380 (99) 999-99-99',
            placeholder: '_',
            completed: null,
            definitions: {
                '9': '[0-9]',
                'a': '[A-Za-z]',
                '*': '[A-Za-z0-9]'
            }
        }
    };

    $.fn.getUnformattedValue = function() {
        var data = this.data('formatter-data');
        if (data && data.type === 'amount') {
            return unformat(this.val(), data.thousandseparator);
        }
        return this.val();
    };

    $.fn.formatter = function(type, options) {
        options = $.extend({}, def[type], options);

        var pattern, caretTimeoutId, partialPosition, len, tests, firstNonMaskPos, defs;

        if (options.keyset) {
            var p = '';
            if (options.reverse) {
                p += '[';
            } else {
                p += '^[';
            }
            for (var i = 0; i < options.keyset.length; i++) {
                var c = options.keyset[i];
                var s = String.fromCharCode(c);
                if (c === 13) {
                    s = '\\r';
                }
                if (c === 10) {
                    s = '\\n';
                }

                p += s;
            }
            p += ']';

            if (!options.reverse) {
                if (options.maxlength) {
                    p += '{0,' + options.maxlength + '}';
                } else {
                    p += '*';
                }

                if (type === 'amount') {
                    p += '(\\.\\d{0,' + options.decimallength + '})?';
                }

                p += '$';
            }
            pattern = new RegExp(p, options.reverse ? 'g' : '');
        } if (options.mask) {
            tests = [];
            firstNonMaskPos = null;
            defs = options.definitions;
            partialPosition = len = options.mask.length;

            $.each(options.mask.split(''), function(i, c) {
                if (c === '?') {
                    len--;
                    partialPosition = i;
                } else if (defs[c]) {
                    tests.push(new RegExp(defs[c]));
                    if (firstNonMaskPos === null) {
                        firstNonMaskPos = tests.length - 1;
                    }
                } else {
                    tests.push(null);
                }
            });
        }

        return this.each(function() {
            var field = $(this);
            var checkVal, buffer, focusText, seekNext, seekPrev, shiftL, shiftR, caret, clearBuffer, writeBuffer;

            if (options.mask) {
                buffer = $.map(options.mask.split(''), function(c) {
                        if (c !== '?') {
                            return defs[c] ? options.placeholder : c;
                        }
                    });
                focusText = field.val();

                seekNext = function(pos) {
                    do {
                        pos++;
                    } while(pos < len && !tests[pos]);
                    return pos;
                };

                seekPrev = function(pos) {
                    do {
                        pos--;
                    } while(pos >= 0 && !tests[pos]);
                    return pos;
                };

                shiftL = function(begin, end) {
                    var i, j;

                    if (begin < 0) {
                        return;
                    }
                    for (i = begin, j = seekNext(end); i < len; i++) {
                        if (tests[i]) {
                            if (j < len && tests[i].test(buffer[j])) {
                                buffer[i] = buffer[j];
                                buffer[j] = options.placeholder;
                            } else {
                                break;
                            }
                            j = seekNext(j);
                        }
                    }
                    writeBuffer();
                    caret(field, Math.max(firstNonMaskPos, begin));
                };

                shiftR = function(pos) {
                    var i, c, j, t;

                    for (i = pos, c = options.placeholder; i < len; i++) {
                        if (tests[i]) {
                            j = seekNext(i);
                            t = buffer[i];
                            buffer[i] = c;
                            if (j < len && tests[j].test(t)) {
                                c = t;
                            } else {
                                break;
                            }
                        }
                    }
                };

                caret = function(that, begin, end) {
                    if (that.length === 0 || that.is(":hidden")) {
                        return;
                    }

                    if (typeof begin === 'number') {
                        end = (typeof end === 'number') ? end : begin;
                        setElementSelection(that[0], begin, end);
                    } else {
                        return getElementSelection(that[0]);
                    }
                };

                clearBuffer = function(start, end) {
                    var i;
                    for (i = start; i < end && i < len; i++) {
                        if (tests[i]) {
                            buffer[i] = options.placeholder;
                        }
                    }
                };

                writeBuffer = function() {
                    field.val(buffer.join(''));
                };

                checkVal = function(allow) {
                    //try to place characters where they belong
                    var test = field.val();
                    var lastMatch = -1;
                    var i, c, pos;

                    for (i = 0, pos = 0; i < len; i++) {
                        if (tests[i]) {
                            buffer[i] = options.placeholder;
                            while (pos++ < test.length) {
                                c = test.charAt(pos - 1);
                                if (tests[i].test(c)) {
                                    buffer[i] = c;
                                    lastMatch = i;
                                    break;
                                }
                            }
                            if (pos > test.length) {
                                break;
                            }
                        } else if (buffer[i] === test.charAt(pos) && i !== partialPosition) {
                            pos++;
                            lastMatch = i;
                        }
                    }
                    if (allow) {
                        writeBuffer();
                    } else if (lastMatch + 1 < partialPosition) {
                        field.val('');
                        clearBuffer(0, len);
                    } else {
                        writeBuffer();
                        field.val(field.val().substring(0, lastMatch + 1));
                    }
                    return (partialPosition ? i : firstNonMaskPos);
                };
            }

            if (type === 'oneline_textarea') {
                var
                    origHeight = field.height(),
                    clone = (function(){
                        var props = ['height','width','lineHeight','textDecoration','letterSpacing'],
                            propOb = {};
                        $.each(props, function(i, prop){
                            propOb[prop] = field.css(prop);
                        });
                        return field.clone().removeAttr('id').removeAttr('name').css({
                            position: 'absolute',
                            top: 0,
                            left: -9999
                        }).css(propOb).attr('tabIndex','-1').insertBefore(field);
                    })(),
                    lastScrollTop = null,
                    updateSize = function() {
                        clone.height(0).val($(this).val()).scrollTop(10000);
                        var scrollTop = Math.max(clone.scrollTop(), origHeight) + 20,
                            toChange = $(this).add(clone);
                        if (lastScrollTop === scrollTop) { return; }
                        lastScrollTop = scrollTop;
                        toChange.height(scrollTop);
                    };
                field.unbind('.autosize').bind('keyup.autosize', updateSize)
                    .bind('keydown.autosize', updateSize).bind('change.autosize', updateSize);
            }

            var fd = field.data('formatter-data');
            if (fd) {
                field.removeData('formatter-data');
                field.unbind('paste', fd.paste);
                field.unbind('keypress', fd.format);
                field.unbind('drop', fd.paste);
                if (options.mask) {
                    field.unbind('focus', fd.focus);
                }
                for (var j = 0; j < fd.blur.length; j++) {
                    field.unbind('blur', fd.blur[j]);
                }
            }

            fd = {
                type: type,
                thousandseparator: options.thousandseparator
            };

            fd.format = function(e) {
                var field = $(e.target);
                var code = e.keyCode;
                var which = e.which;

                // разрешаем стрелочки
                if (!e.shiftKey && code >= 34 && code <= 40 && which !== code) {
                    return true;
                }

                var old, pos, sum;

                var setValue = function(amount) {
                    amount = unformat(amount, options.thousandseparator);
                    if (pattern.test(amount)) {
                        var val = autoGroup(amount, options.thousandseparator);
                        var diff = old.length - val.length;
                        field.val(val);
                        setElementSelection(field[0], pos.end - diff, pos.end - diff);
                        field.trigger('input');
                    }
                };

                // разрешаем backspace, tab, delete
                if (code === 8 || code === 9 || code === 46) {
                    if (options.mask && code !== 9) {
                        pos = caret(field);
                        var begin = pos.start;
                        var end = pos.end;
                        if (end - begin === 0) {
                            begin = code !== 46 ? seekPrev(begin) : (end = seekNext(begin-1));
                            end = code === 46 ? seekNext(end) : end;
                        }
                        clearBuffer(begin, end);
                        shiftL(begin, end - 1);
                        e.preventDefault();
                        return false;
                    }

                    if (type === 'amount') {
                        if (code === 9) {
                            return true;
                        }
                        old = field.val();
                        pos = getElementSelection(field[0]);
                        if (which === 0 || code === 8) {
                            sum = old.substring(0, code === 8 ? Math.max(0,pos.start-1) : pos.start);
                            sum += old.substring(code === 46 ? Math.min(old.length,pos.end+1) : pos.end, old.length);
                        } else {
                            sum = old.substring(0, pos.start);
                            sum += '.';
                            sum += old.substring(pos.end, old.length);
                        }
                        if (!sum) {
                            return true;
                        }
                        setValue(sum);
                        e.preventDefault();
                        return false;
                    }
                    return true;
                }

                // выделение по ctrl+a
                if ((e.ctrlKey || e.metaKey) && which === 97) {
                    return true;
                }

                // копировать (c=99), вставить (v=118), вырезать (x=120) */
                if ((e.ctrlKey || e.metaKey) && (which === 99 || which === 118 || which === 120)) {
                    return true;
                }

                if (options.mask) {
                    pos = caret(field);
                    var p, c, next;

                    if (e.ctrlKey || e.altKey || e.metaKey || which < 32) {//Ignore
                        return true;
                    } else if (which) {
                        if (pos.end - pos.start !== 0){
                            clearBuffer(pos.start, pos.end);
                            shiftL(pos.start, pos.end - 1);
                        }
                        p = seekNext(pos.start - 1);
                        if (p < len) {
                            c = String.fromCharCode(which);
                            if (tests[p].test(c)) {
                                shiftR(p);

                                buffer[p] = c;
                                writeBuffer();
                                next = seekNext(p);
                                caret(field, next);
                                if (options.completed && next >= len) {
                                    options.completed.call(field);
                                }
                            }
                        }
                        e.preventDefault();
                        return false;
                    }
                }

                if (type === 'amount') {
                    old = field.val();
                    pos = getElementSelection(field[0]);
                    sum = old.substring(0, pos.start) + String.fromCharCode(which) + old.substring(pos.end, old.length);
                    setValue(sum);
                    e.preventDefault();
                    return false;
                }

                // контроль длины
                if (options.maxlength && field.val().length === options.maxlength) {
                    e.preventDefault();
                    return false;
                }

                // контроль вводимых символов
                if (options.keyset) {
                    var idx = options.keyset.indexOf(e.which);
                    if ((options.reverse && idx >= 0) || (!options.reverse && idx < 0))  {
                        e.preventDefault();
                        return false;
                    }
                }

                return true;
            };

            fd.blur = [];

            if (options.decimallength) {
                fd.blur.push(function() {
                    var val = unformat(field.val(), options.thousandseparator);
                    val = parseFloat(val);
                    val = isNaN(val) ? '' : val.toFixed(options.decimallength);
                    val = autoGroup(val, options.thousandseparator);
                    field.val(val);
                    if (val !== (field.data('prev-value') || '')) {
                        field.change();
                    }
                });
            }

            if (options.trimonblur) {
                fd.blur.push(function() {
                    var val = field.val().replace(/^\s+|\s+$/g, '');
                    field.val(val).change();
                });
            }

            if (options.mask) {
                fd.blur.push(function() {
                    checkVal();
                    if (field.val() !== focusText) {
                        field.change();
                    }
                });
                fd.focus = function() {
                    clearTimeout(caretTimeoutId);
                    var position;

                    focusText = field.val();
                    position = checkVal();
                    caretTimeoutId = setTimeout(function() {
                        writeBuffer();
                        if (position === options.mask.length) {
                            caret(field, 0, position);
                        } else {
                            caret(field, position);
                        }
                    }, 10);
                };
            }

            fd.paste = function() {
                var old = field.val();
                setTimeout(function() {
                    if (options.mask) {
                        var position = checkVal(true);
                        caret(field, position);
                        if (options.completed && position === field.val().length) {
                            options.completed.call(field);
                        }
                    } else {
                        var s = field.val();
                        if (type === 'amount') {
                            s = unformat(s, options.thousandseparator);
                        }
                        if (options.reverse) {
                            s = s.replace(pattern, '');
                        } else if (!pattern.test(s)) {
                            s = old;
                        }
                        if (options.reverse && options.maxlength && s.length > options.maxlength) {
                            s = s.substring(0, options.maxlength);
                        }
                        if (type === 'amount') {
                            s = autoGroup(s, options.thousandseparator);
                        }
                        field.val(s).trigger($.Event("input"));
                    }
                }, 0);
                return true;
            };

            if (options.mask) {
                field.bind('focus', fd.focus);
            }
            field.bind('paste', fd.paste);
            if (!field.attr('disabled') && ! field.attr('readonly')) {
                field.bind('keypress', this, fd.format);
            }
            field.bind('drop', fd.paste);
            for (var i = 0; i < fd.blur.length; i++) {
                field.bind('blur', fd.blur[i]);
            }

            field.bind('change', function() {
                var e = $(this);
                e.data('prev-value', e.val());
            });

            field.data('formatter-data', fd);
            if (options.mask) {
                checkVal();
            }
        });
    };
})(jQuery);
