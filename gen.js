#!/usr/bin/env node --harmony

var fs = require('fs');
var outFiles = {};

var input = '';
process.stdin.on('data', (buf) => input += buf.toString());
process.stdin.on('end', () => {
  var data = JSON.parse(input);

  function mkDoc (doc) {
    var doc = [];
    doc.push('/**');
    decl.doc.replace(/( *\n){3,}/g, '\n\n').replace(/\s+$/, '').split(/\n/).forEach((line) => doc.push(' * ' + line));
    doc.push(' */');
    return doc;
  }

  function indent (s) {
    return s.replace(/^./, '  $&');
  }

  for (var cat in data.categories) {
    var result = [];

    var catName = data.categories[cat].name.replace(/\W/g, '_');
    var decls = data.categories[cat].decls;
    var exports = {};

    function mkTypedName (o) {
      var name = o.name,
          typeName = o.type.name,
          typeCat  = o.type.category;

      if (typeCat && typeCat !== cat) {
        typeName = data.categories[typeCat].name.replace(/\W/g, '_') + '.' + typeName;
        if (references.indexOf(typeCat) === -1) {
          references.push(typeCat);
        }
      }

      if (/^(.+)\.\.\.$/.test(typeName)) {
        typeName = RegExp.$1 + '[]';
        name = '...' + o.name;
      }

      return name + ': ' + typeName;
    }

    var references = [ 'types' ];
    result.push(
      'declare module GoogleAppsScript {',
      '  export module ' + catName + ' {'
    );

    for (var name in decls) {
      var decl = decls[name];
      if (!decl) continue;

      var lines = mkDoc(decl.doc);
      if (decl.kind === 'enum') {
        lines.push('export enum ' + decl.name + ' { ' + decl.properties.map((p) => p.name).join(', ') + ' }');
        lines.push('');
      } else {
        lines.push('export interface ' + decl.name + ' {');
        lines.push.apply(lines, decl.properties.map(mkTypedName).map(indent))
        lines.push.apply(lines,
          decl.methods.map((method) =>
            mkTypedName({
              name: method.name + '(' +
                  method.params.map(mkTypedName).join(', ')
                    .replace(/(\bsql:.*)\bsql:/g, '$1sql_:') + // ad-hoc fix for same-named arguments in jdbc
                ')',
              type: method.returnType
            }) + ';'
          ).map(indent)
        )
        lines.push('}');
        lines.push('');
      }

      if (data.services[decl.url]) {
        exports[name] = true;
      }

      result = result.concat(lines.map(indent).map(indent));
    }

    result.push(
      '  }',
      '}',
      ''
    );

    for (var name in exports) {
      var line = 'declare var ' + name + ': GoogleAppsScript.' + catName + '.' + name + ';'
      if (name === 'MimeType') {
        result.push('// conflicts with MimeType in lib.d.ts');
        result.push('// ' + line);
      } else {
        result.push(line);
      }
    }

    result = references.map((ref) => '/// <reference path="google-apps-script.' + ref + '.d.ts" />')
      .concat('', result);

    var file = 'google-apps-script/google-apps-script.' + cat + '.d.ts';
    var f = fs.openSync(file, 'w');
    fs.writeSync(f, result.join('\n'));
    console.error('Wrote to ' + file);
  }
});
