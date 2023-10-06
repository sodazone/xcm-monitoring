export default {
  'title': 'JSON Patch',
  'description': 'A JSON Schema describing a JSON Patch',
  'type': 'array',
  'items': {
    'description': 'one JSON Patch operation',
    'allOf': [
      {
        'description': 'Members common to all operations',
        'type': 'object',
        'required': ['op', 'path'],
        'properties': {
          'path': { '$ref': '#/definitions/jsonPointer' }
        }
      },
      { '$ref': '#/definitions/oneOperation' }
    ]
  },
  'definitions': {
    'jsonPointer': {
      'type': 'string',
      'pattern': '^(/[^/~]*(~[01][^/~]*)*)*$'
    },
    'add': {
      'description': 'add operation. Value can be any JSON value.',
      'type': 'object',
      'properties': { 'op': { 'enum': ['add'] } },
      'required': ['value']
    },
    'remove': {
      'description': 'remove operation. Only a path is specified.',
      'type': 'object',
      'properties': { 'op': { 'enum': ['remove'] } }
    },
    'replace': {
      'description': 'replace operation. Value can be any JSON value.',
      'type': 'object',
      'properties': { 'op': { 'enum': ['replace'] } },
      'required': ['value']
    },
    'move': {
      'description': 'move operation. "from" is a JSON Pointer.',
      'type': 'object',
      'properties': {
        'op': { 'enum': ['move'] },
        'from': { '$ref': '#/definitions/jsonPointer' }
      },
      'required': ['from']
    },
    'copy': {
      'description': 'copy operation. "from" is a JSON Pointer.',
      'type': 'object',
      'properties': {
        'op': { 'enum': ['copy'] },
        'from': { '$ref': '#/definitions/jsonPointer' }
      },
      'required': ['from']
    },
    'test': {
      'description': 'test operation. Value can be any JSON value.',
      'type': 'object',
      'properties': { 'op': { 'enum': ['test'] } },
      'required': ['value']
    },
    'oneOperation': {
      'oneOf': [
        { '$ref': '#/definitions/add' },
        { '$ref': '#/definitions/remove' },
        { '$ref': '#/definitions/replace' },
        { '$ref': '#/definitions/move' },
        { '$ref': '#/definitions/copy' },
        { '$ref': '#/definitions/test' }
      ]
    }
  }
};