import COMMONMARK_CONVERTERS from './commonmark-converters'
import OptionsValidator from './options-validator'
import { extend } from './utilities'
import RootNode from './root-node'
import Node from './node'
var reduce = Array.prototype.reduce
var leadingNewLinesRegExp = /^\n*/
var trailingNewLinesRegExp = /\n*$/
var optionsValidator = new OptionsValidator()

export default function TurndownService (options) {
  var defaults = {
    converters: COMMONMARK_CONVERTERS,
    headingStyle: 'setext',
    hr: '* * *',
    bulletListMarker: '*',
    codeBlockStyle: 'indented',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    br: '  ',
    blankConverter: {
      replacement: function (content, node) {
        return node.isBlock ? '\n\n' : ''
      }
    },
    defaultConverter: {
      replacement: function (content, node) {
        return node.isBlock ? '\n\n' + content + '\n\n' : content
      }
    },
    keepConverter: {
      filter: function (node) {
        switch (node.nodeName) {
          case 'TABLE':
            return true
          case 'PRE':
            return node.firstChild && node.firstChild.nodeName !== 'CODE'
          default:
            return false
        }
      },
      replacement: function (content, node) {
        return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML
      }
    },
    removeConverter: {
      filter: ['head', 'script'],
      replacement: function () {
        return ''
      }
    }
  }
  optionsValidator.validate(options)
  this.options = extend({}, defaults, options)
}

TurndownService.prototype = {
  turndown: function (input) {
    if (!canConvert(input)) {
      throw new TypeError(
        input + ' is not a string, or an element/document/fragment node.'
      )
    }

    if (input === '') return ''

    var root = new RootNode(input)
    return this.postProcess(this.process(root))
  },

  /**
   * Reduces a DOM node down to its Markdown string equivalent
   */

  process: function process (parentNode) {
    var _this = this
    return reduce.call(parentNode.childNodes, function (output, node) {
      node = new Node(node)

      var replacement
      if (node.nodeType === 3) {
        replacement = _this.escape(node.nodeValue)
      } else if (node.nodeType === 1) {
        replacement = _this.replacementForNode(node)
      }

      return join(output, replacement)
    }, '')
  },

  /**
   * Escapes Markdown syntax
   */

  escape: function escape (string) {
    return (
      string
        // Escape hr
        .replace(/^([-*_] *){3,}$/gm, function (match, character) {
          return match.split(character).join('\\' + character)
        })

        // Escape ol bullet points
        .replace(/^(\W* {0,3})(\d+)\. /gm, '$1$2\\. ')

        // Escape ul bullet points
        .replace(/^([^\\\w]*)([*+-]) /gm, '$1\\$2 ')

        // Escape blockquote indents
        .replace(/^(\W* {0,3})> /gm, '$1\\> ')

        // Escape em/strong *
        .replace(/\*{1,2}([^\W*]+\W*)+\*{1,2}/g, function (match) {
          return match.replace(/\*/g, '\\*')
        })

        // Escape em/strong _
        .replace(/_{1,2}([^\W_]+\W*)+_{1,2}/g, function (match) {
          return match.replace(/_/g, '\\_')
        })

        // Escape `
        .replace(/`([^\W`]+\W*)+`/g, function (match) {
          return match.replace(/`/g, '\\`')
        })

        // Escape link brackets
        .replace(/\[([^\]]*)\]/g, '\\[$1\\]') // eslint-disable-line no-useless-escape
    )
  },

  /**
   * Converts an element node to its Markdown equivalent
   */

  replacementForNode: function replacementForNode (node) {
    var converter = this.converterForNode(node)
    var content = this.process(node)
    var whitespace = node.flankingWhitespace
    if (whitespace.leading || whitespace.trailing) content = content.trim()

    return (
      whitespace.leading +
      converter.replacement(content, node, this.options) +
      whitespace.trailing
    )
  },

  /**
   * Finds a converter for a given node
   */

  converterForNode: function converterForNode (node) {
    if (this.filterValue(this.options.keepConverter, node)) {
      return this.options.keepConverter
    }
    if (this.filterValue(this.options.removeConverter, node)) {
      return this.options.removeConverter
    }
    if (node.isBlank) return this.options.blankConverter

    for (var key in this.options.converters) {
      var converter = this.options.converters[key]
      if (this.filterValue(converter, node)) return converter
    }

    return this.options.defaultConverter
  },

  filterValue: function filterValue (converter, node) {
    var filter = converter.filter
    if (typeof filter === 'string') {
      if (filter === node.nodeName.toLowerCase()) return true
    } else if (Array.isArray(filter)) {
      if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true
    } else if (typeof filter === 'function') {
      if (filter.call(converter, node, this.options)) return true
    } else {
      throw new TypeError('`filter` needs to be a string, array, or function')
    }
  },

  postProcess: function postProcess (output) {
    for (var key in this.options.converters) {
      var converter = this.options.converters[key]
      if (typeof converter.append === 'function') {
        output = join(output, converter.append(this.options))
      }
    }
    return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
  }
}

function separatingNewlines (output, replacement) {
  var newlines = [
    output.match(trailingNewLinesRegExp)[0],
    replacement.match(leadingNewLinesRegExp)[0]
  ].sort()
  var maxNewlines = newlines[newlines.length - 1]
  return maxNewlines.length < 2 ? maxNewlines : '\n\n'
}

function join (string1, string2) {
  var separator = separatingNewlines(string1, string2)

  // Remove trailing/leading newlines and replace with separator
  string1 = string1.replace(trailingNewLinesRegExp, '')
  string2 = string2.replace(leadingNewLinesRegExp, '')

  return string1 + separator + string2
}

/**
 * Determines whether an input can be converted
 */

function canConvert (input) {
  return (
    input != null && (
      typeof input === 'string' ||
      input.nodeType && (
        input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11
      )
    )
  )
}
