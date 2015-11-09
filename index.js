var fs           = require('fs'),
    path         = require('path'),
    es           = require('event-stream'),
    gutil        = require('gulp-util'),
    glob         = require('glob-all'),
    CoffeeScript = require('coffee-script')

var extensions    = ['js', 'js.coffee', 'coffee'];
var includePaths  = [];

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

  var process = function(content) {
    var matches;

    if (!(matches = content.match(/^(\s+)?(\/\/|\/\*|\#)(\s+)?=(\s+)?(include|require)(.+$)/mg)))
      return content;

    for (var i = 0; i < matches.length; i++) {
      var requirePath = matches[i]
        .replace(/(\s+)/gi, " ")
        .replace(/(\/\/|\/\*|\#)(\s+)?=(\s+)?/g, "")
        .replace(/(\*\/)$/gi, "")
        .replace(/['"]/g, "")
        .trim()
        .split(' ')[1];

      var fileMatches = glob.sync(includePaths.map(function(path) {
        return path + '/' + requirePath + '.+(' + extensions.join('|') + ')';
      }));

      if (!fileMatches) {
        content = content.replace(matches[i], '');
        continue;
      }

      var globbedFilePath = fileMatches[0];

      if (includedFiles.indexOf(globbedFilePath) == -1) {
        includedFiles.push(globbedFilePath);
      } else {
        continue;
      }

      var fileContents = fs.readFileSync(globbedFilePath).toString();

      if (path.extname(globbedFilePath) == '.coffee') {
        var directives      = fileContents.match(/#=(.+)/g);
        var compiledContent = directives && directives.join("\n") || '';
        compiledContent    += "\n" + CoffeeScript.compile(fileContents) + ";\n";
        compiledContent     = process(compiledContent);
      } else {
        compiledContent = process(fileContents) + ";\n";
      }

      content = content.replace(matches[i], function() { return compiledContent });
    }

    return content;
  }

  return process(content);
}