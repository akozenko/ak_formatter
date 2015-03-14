# Formatter
Some formatters for input fields



Demos/Examples
--------------

[view demo](http://akozenko.github.io/ak_formatter/)



Usage
-----

## $(selector).formatter(type, opts)

      $('.card').formatter('number', {
        mask          : '9999 9999 9999 9999',
        placeholder   : '_',
        completed     : null,
        definitions   : { '9': '[0-9]'}
      });

