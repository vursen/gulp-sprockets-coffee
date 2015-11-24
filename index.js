var fs           = require('fs'),
    path         = require('path'),
    es           = require('event-stream'),
    gutil        = require('gulp-util'),
    glob         = require('glob-all'),
    CoffeeScript = require('coffee-script');

var extensions    = ['js', 'js.coffee', 'coffee'];
var includePaths  = [];
var cache         = {};

module.exports = function (params) {
    var params    = params || {};

    if (params.extensions) {
      extensions = typeof params.extensions === 'string' ? [params.extensions] : params.extensions;
    }

    if (params.includePaths) {
      includePaths = params.includePaths;
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
  file.path         = gutil.replaceExtension(file.path, '.js')

  var compile = function(content, filePath) {
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
        fileMatches = glob.sync(includePaths.map(function(path) {
          return [path, requirePath + '.+(' + extensions.join('|') + ')'].join('/');
        }));

        if (fileMatches) {
          fileMatches = fileMatches.slice(0, 1);
        }
      }

      if (!fileMatches) {
        content = content.replace(matches[i], ''); continue;
      }

      for (var j = 0; j < fileMatches.length; j++) {
        var globbedFilePath = fileMatches[j];

        if (includedFiles.indexOf(globbedFilePath) == -1) {
          includedFiles.push(globbedFilePath);
        } else { continue }

        var fileContents = fs.readFileSync(globbedFilePath).toString();

        if ([]) {

        }

        if (path.extname(globbedFilePath) == '.coffee') {

          console.time('coffee')
          if (!(compiledContent = cache[globbedFilePath])) {
            var directives      = fileContents.match(/#=(.+)/g);
            var compiledContent = directives && directives.join("\n") || '';
            compiledContent    += "\n" + CoffeeScript.compile(fileContents) + ";\n";
            compiledContent     = compile(compiledContent, globbedFilePath);

            cache[globbedFilePath] = compiledContent;
          }
          console.timeEnd('coffee');

        } else {
          compiledContent = compile(fileContents, globbedFilePath) + ";\n";
        }

        compiledResultContent += compiledContent;
      }

      content = content.replace(matches[i], function() { return compiledResultContent });
    }

    return content;
  }

  return compile(content, file.path);
}