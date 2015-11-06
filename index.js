var fs           = require('fs'),
    path         = require('path'),
    es           = require('event-stream'),
    gutil        = require('gulp-util'),
    glob         = require('glob-all'),
    CoffeeScript = require('coffee-script')

var extensions    = ['js', 'js.coffee', 'coffee'],
    includePaths  = [],
    includedFiles = [];

module.exports = function (params) {
    var params    = params || {};
    includedFiles = [];
    includePaths  = [];
    extensions    = [];

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
        var newText = processInclude(String(file.contents), file.path);
        file.contents = new Buffer(newText);
      }

      callback(null, file);
    }

    return es.map(include)
};

function processInclude(content, filePath) {
  var matches = content.match(/^(\s+)?(\/\/|\/\*|\#)(\s+)?=(\s+)?(include|require)(.+$)/mg);

  if (!matches) return content;

  for (var i = 0; i < matches.length; i++) {
    var includeCommand = matches[i]
      .replace(/(\s+)/gi, " ")
      .replace(/(\/\/|\/\*|\#)(\s+)?=(\s+)?/g, "")
      .replace(/(\*\/)$/gi, "")
      .replace(/['"]/g, "")
      .trim();

    var split = includeCommand.split(" ");

    var fileMatches = glob.sync(includePaths.map(function(path) {
      return path + '/' + split[1] + '.+(' + extensions.join('|') + ')';
    }));

    if (!fileMatches) {
      content = content.replace(matches[i], '');
      continue;
    }

    var globbedFilePath = fileMatches[0];

    if (includedFiles.indexOf(globbedFilePath) > -1) {
      includedFiles.push(globbedFilePath);
    } else {
      continue;
    }

    var fileContents = fs.readFileSync(globbedFilePath).toString();

    if (path.extname(globbedFilePath) == '.coffee') {
      var requires        = fileContents.match(/#=(.+)/g);
      var compiledContent = requires && requires.join("\n") || '';
      compiledContent    += "\n" + CoffeeScript.compile(fileContents) + ";\n";
      compiledContent     = processInclude(compiledContent);
    } else {
      compiledContent = processInclude(fileContents) + ";\n";
    }

    content = content.replace(matches[i], function() { return compiledContent });
  }

  return content;
}
