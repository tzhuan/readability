var jsdom = require('jsdom');
var request = require('request');
var helpers = require('./helpers');
var encodinglib = require("encoding");
var urllib = require('url');

exports.debug = function(debug) {
  helpers.debug(debug);
};

exports.debug(false);

function Readability(window, options) {
  this._window = window;
  this._document = window.document;
  this.iframeLoads = 0;
  // Cache the body HTML in case we need to re-use it later
  this.bodyCache = null;
  this._articleContent = '';
  helpers.setCleanRules(options.cleanRulers || []);

  this.cache = {};

  helpers.prepDocument(this._document);
  this.cache = {
    'body': this._document.body.innerHTML
  };

  this.__defineGetter__('content', function() {
    return this.getContent(true);
  });
  this.__defineGetter__('title', function() {
    return this.getTitle(true);
  });
  this.__defineGetter__('html', function() {
    return this.getHTML(true);
  });
  this.__defineGetter__('document', function() {
    return this.getDocument(true);
  });
  this.__defineGetter__('byline', function() {
    return this.getByline(true)
  });
  this.__defineGetter__('excerpt', function() {
    return this.getExcerpt(true)
  });
  this.__defineGetter__('metadata', function() {
    return this.getMetadata(true)
  });
}

Readability.prototype.close = function() {
  if (this._window) {
    this._window.close();
  }
  this._window = null;
  this._document = null;
};

Readability.prototype.getContent = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getContent()` is deprecated, using `content` property instead.');
  }
  if (typeof this.cache['article-content'] !== 'undefined') {
    return this.cache['article-content'];
  }

  var articleContent = helpers.grabArticle(this._document);
  if (helpers.getInnerText(articleContent, false) === '') {
    this._document.body.innerHTML = this.cache.body;
    articleContent = helpers.grabArticle(this._document, true);
    if (helpers.getInnerText(articleContent, false) === '') {
      return this.cache['article-content'] = false;
    }
  }

  this.cache['article-content-dom'] = articleContent;
  return this.cache['article-content'] = articleContent.innerHTML;
};

Readability.prototype.getTitle = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getTitle()` is deprecated, using `title` property instead.');
  }
  if (typeof this.cache['article-title'] !== 'undefined') {
    return this.cache['article-title'];
  }

  var title = this._document.title;
  var betterTitle;
  var commonSeparatingCharacters = [' | ', ' _ ', ' - ', '«', '»', '—'];

  var self = this;
  commonSeparatingCharacters.forEach(function(char) {
    var tmpArray = title.split(char);
    if (tmpArray.length > 1) {
      if (betterTitle) return self.cache['article-title'] = title;
      betterTitle = tmpArray[0].trim();
    }
  });

  if (betterTitle && betterTitle.length > 10) {
    return this.cache['article-title'] = betterTitle;
  }

  return this.cache['article-title'] = title;
};

Readability.prototype.getDocument = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getDocument()` is deprecated, using `document` property instead.');
  }
  return this._document;
};

Readability.prototype.getHTML = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getHTML()` is deprecated, using `html` property instead.');
  }
  return this._document.getElementsByTagName('html')[0].innerHTML;
};

Readability.prototype.getByline = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getByline()` is deprecated, using `byline` property instead.');
  }
  var ab = 'article-byline';
  var am = 'article-metadata';
  if (typeof this.cache[ab] === 'undefined') {
    if (typeof this.cache[am] === 'undefined') {
      this.getMetadata(true);
    }
    if (this.cache[am].byline) {
      this.cache[ab] = this.cache[am].byline;
    } else {
      this.cache[ab] = helpers.grabByline(this._document);
    }
  }
  return this.cache[ab];
};

Readability.prototype.getExcerpt = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getExcerpt()` is deprecated, using `excerpt` property instead.');
  }
  var ae = 'article-excerpt';
  var acd = 'article-content-dom';
  if (typeof this.cache[ae] === 'undefined') {
    if (typeof this.cache[acd] === 'undefined') {
      this.getContent(true);
    }
    this.cache[ae] = this.cache[acd] ? helpers.grabExcerpt(this.cache[acd]) : false;
  }
  return this.cache[ae];
};

Readability.prototype.getMetadata = function(notDeprecated) {
  if (!notDeprecated) {
    console.warn('The method `getMetadata()` is deprecated, using `metadata` property instead.');
  }
  var am = 'article-metadata';
  if (typeof this.cache[am] === 'undefined') {
    this.cache[am] = helpers.grabMetadata(this._document);
  }
  return this.cache[am];
};

function _findHTMLCharset(htmlbuffer) {

  var body = htmlbuffer.toString("ascii"),
    input, meta, charset;

  if (meta = body.match(/<meta\s+http-equiv=["']content-type["'][^>]*?>/i)) {
    input = meta[0];
  }

  if (input) {
    charset = input.match(/charset\s?=\s?([a-zA-Z\-0-9]*);?/);
    if (charset) {
      charset = (charset[1] || "").trim().toLowerCase();
    }
  }

  if (!charset && (meta = body.match(/<meta\s+charset=["'](.*?)["']/i))) {
    charset = (meta[1] || "").trim().toLowerCase();
  }

  return charset;
}

function _parseContentType(str) {
  if (!str) {
    return {};
  }
  var parts = str.split(";"),
    mimeType = parts.shift(),
    charset, chparts;

  for (var i = 0, len = parts.length; i < len; i++) {
    chparts = parts[i].split("=");
    if (chparts.length > 1) {
      if (chparts[0].trim().toLowerCase() == "charset") {
        charset = chparts[1];
      }
    }
  }

  return {
    mimeType: (mimeType || "").trim().toLowerCase(),
    charset: (charset || "UTF-8").trim().toLowerCase() // defaults to UTF-8
  };
}

function read(html, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var overrideEncoding = options.encoding,
      preprocess = options.preprocess;

  options.encoding = null;
  delete options.preprocess;

  var parsedURL = urllib.parse(html);
  if (['http:', 'https:', 'unix:', 'ftp:', 'sftp:'].indexOf(parsedURL.protocol) === -1) {
    jsdomParse(null, null, html);
  } else {
    request(html, options, function(err, res, buffer) {
      if (err) {
        return callback(err);
      }

      var content_type = _parseContentType(res.headers['content-type']);

      if (content_type.mimeType == "text/html") {
        content_type.charset = _findHTMLCharset(buffer) || content_type.charset;
      }

      content_type.charset = (overrideEncoding || content_type.charset || "utf-8").trim().toLowerCase();

      if (!content_type.charset.match(/^utf-?8$/i)) {
        buffer = encodinglib.convert(buffer, "UTF-8", content_type.charset);
      }

      buffer = buffer.toString();

      if (preprocess) {
        preprocess(buffer, res, content_type, function(err, buffer) {
          if (err) return callback(err);
          jsdomParse(null, res, buffer);
        });
      } else {
        jsdomParse(null, res, buffer);
      }
    });
  }

  function jsdomParse(error, meta, body) {
    if (error) {
      return callback(error);
    }

    if (typeof body !== 'string') body = body.toString();
    if (!body) return callback(new Error('Empty story body returned from URL'));
    jsdom.env({
      html: body,
      done: function(errors, window) {
        if (meta) {
          window.document.originalURL = meta.request.uri.href;
        } else {
          window.document.originalURL = null;
        }

        if (errors) {
          window.close();
          return callback(errors);
        }
        if (!window.document.body) {
          window.close();
          return callback(new Error('No body tag was found.'));
        }

        try {
          var readability = new Readability(window, options);

          // add meta information to callback
          callback(null, readability, meta);
        } catch (ex) {
          window.close();
          return callback(ex);

        }
      }
    });
  }
}

module.exports = read;
module.exports.read = function() {
  console.warn('`readability.read` is deprecated. Just use `var read = require("node-readability"); read(url...);`.');
  return read.apply(this, arguments);
};
