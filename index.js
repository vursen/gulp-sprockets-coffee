const fs           = require('fs');
const path         = require('path');
const es           = require('event-stream');
const gutil        = require('gulp-util');
const glob         = require('glob-all');
const CoffeeScript = require('coffee-script');
const babel        = require('babel-core');

var extensions    = ['js', 'js.coffee', 'coffee', 'es6.js'];
var includePaths  = [];
var cache         = {};
var babelOptions  = {};

module.exports = function (params) {
  var params = params || {};

  if (params.extensions) {
    extensions = typeof params.extensions === 'string' ? [params.extensions] : params.extensions;
  }

  if (params.includePaths) {
    includePaths = params.includePaths;
  }

  if (params.babelOptions) {
    babelOptions = params.babelOptions;
  }

  function include(file, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }

    if (file.isStream()) {
      throw new gutil.PluginError('gulp-sprockets-js', 'stream not supported');
    }

    if (file.isBuffer()) {
      file.contents = new Buffer(sprocketsJS(file));
    }

    callback(null, file);
  }

  return es.map(include)
};

function sprocketsJS(file) {
  var includedFiles = [];
  var content       = String(file.contents);

  if (path.extname(file.path) == '.coffee') {
    content = coffeeCompile(content);
  }

  file.path = gutil.replaceExtension(file.path, '.js');

  function coffeeCompile(fileContents) {
    var directives = fileContents.match(/#=(.+)/g);
    return (directives && directives.join("\n") || '') + "\n" + CoffeeScript.compile(fileContents);
  }

  function processFile(content, filePath) {
    var matches;

    if (!(matches = content.match(/^(\s+)?(\/\/|\/\*|\#)(\s+)?=(\s+)?(include|require)(.+$)/mg)))
      return content;

    for (var i = 0; i < matches.length; i++) {
      var fileMatches, compiledResultContent = '';
      var requirePath = matches[i]
        .replace(/(\s+)/gi, " ")
        .replace(/(\/\/|\/\*|\#)(\s+)?=(\s+)?/g, "")
        .replace(/(\*\/)$/gi, "")
        .replace(/['"]/g, "")
        .trim()
        .split(' ')[1];

      if (/\*$/.test(requirePath)) {
        fileMatches = glob.sync(path.normalize(path.join(path.dirname(filePath), requirePath)), {
          nodir: true
        });
      } else {
        fileMatches = glob.sync(includePaths.map((path) => {
          return `${ path }/${ requirePath }.+(${ extensions.join('|') })`;
        }));

        if (fileMatches) { fileMatches = fileMatches.slice(0, 1) }
      }

      if (!fileMatches.length) {
        throw new gutil.PluginError('gulp-sprockets-js', `${ requirePath } not found.`)
      }

      fileMatches.forEach((globbedFilePath) => {
        var fileStat = fs.statSync(globbedFilePath);
        var fileContents;

        if (!cache[globbedFilePath] || cache[globbedFilePath].mtime.getTime() !== fileStat.mtime.getTime()) {
          fileContents = fs.readFileSync(globbedFilePath).toString();

          if (/\.coffee$/.test(globbedFilePath)) {
            fileContents = coffeeCompile(fileContents);
          }

          if (/\.es6.js$/.test(globbedFilePath)) {
      			var code = babel.transform(fileContents, Object.assign({
              filename: globbedFilePath
            }, babelOptions)).code;

            fileContents = `(function() { ${code} })();`;
          }

          cache[globbedFilePath] = {
            content: fileContents,
            mtime: fileStat.mtime
          }
        } else {
          fileContents = cache[globbedFilePath].content;
        }

        compiledResultContent += processFile(fileContents, globbedFilePath) + ";\n";
      });

      content = content.replace(matches[i], () => compiledResultContent);
    }

    return content;
  }

  return processFile(content, file.path);
}