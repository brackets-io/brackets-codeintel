/*
 * Copyright (c) 2014 Danny Moerkerke <danny@dannymoerkerke.nl>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Menus               = brackets.getModule("command/Menus"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        StringUtils         = brackets.getModule("utils/StringUtils");
    
    // mapping of extensions to method call operators
    var operators = {
        php: '->',
        js: '.'
    };
    
    // boolean which indicates if file was found, used to reject promise
    var found;

    // Constants
    var NAVIGATE_CODEINTEL  = "Codeintel",
        CMD_CODEINTEL    = "dannymoerkerke.codeIntel";
    
    /**
     * Gets selected text in current document.
     * If there is no selection then select the word at the cursor position.
     * Returns the selected text and the operator (if any) preceding this selection to specify if the selection is a method call.
     * This is the case if the extension of the current file is a key in operators and the character(s) preceding the selection match the value of this key.
     *
     * @param   Editor    editor active editor
     * @returns Object    
     */
    function getSelection(editor) {
        var sel = editor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        var selection = editor.getSelectedText();

        if (!selection) {
            editor.selectWordAt(sel.start);
            selection = editor.getSelectedText();
            sel = editor.getSelection();
        }
        var ext = FileUtils.getFileExtension(editor.document.file.fullPath);
        var op = operators[ext];
        var operator = editor.document.getRange({line: sel.start.line, ch: sel.start.ch - op.length}, {line: sel.start.line, ch: sel.start.ch});
        
        if(operator === op) {
            var parts = editor.document.getLine(sel.start.line).split(selection);
            var o = parts[0].substr(0, parts[0].length - operator.length);
            
            var obj = o.indexOf('=') !== -1 ? o.split('=').pop().trim() : o.trim();
            return {text: selection, operator: operator, object: obj};
        }
        return {text: selection};
    }
    
    /**
     * Find method definition in current document.
     * When not found, recursively try to find the method in parent class(es)
     * 
     * @param   String   name name of method
     * @param   Document doc  current document being searched
     * @param   Deferred def  deferred object to be resolved with document in which method definition was found and the line
     * @returns Promise 
     */
    function findMethod(name, doc, def) {
        var deferred = def || new $.Deferred();
        console.log('method', name);
        var lines = StringUtils.getLines(doc.getText());
        var matchedLine;
        
        lines.map(function(line, index) {
           if(line.match('function ' + name)) {
               matchedLine = index;
           } 
        });

        if(matchedLine) {
            console.log('matchedLine', matchedLine, 'doc', doc);
            deferred.resolve(matchedLine, doc);
        }
        else {
            console.log('getParent');
            getParent(doc)
            .done(function(parent) {
                console.log('parent', parent);
                findMethod(name, parent, deferred);
            })
            .fail(handleError);
        }
        
        return deferred.promise();
    }
    
    /**
     * Gets the parent class of the current document
     * 
     * @param   Document doc current document being searched
     * @returns Promise
     */
    function getParent(doc) {
        var docs = DocumentManager.getAllOpenDocuments();
        
        console.log('docs', docs);
        var deferred = new $.Deferred();
        var parentName = getParentName(doc);
        
        if(parentName === null) {
            return deferred.resolve(null);
        }
        
        var result = DocumentManager.getAllOpenDocuments()
        .filter(function(document) {
            return document.file.fullPath.indexOf(parentName) !== -1;
        });
        
        if(result.length) {
            console.log('parent already open');
            deferred.resolve(result[0]); 
        }
        else {
            findFile(parentName, doc)
            .then(getDocumentForFile)
            .done(function(parentDoc) {
                console.log('resolve doc');
                deferred.resolve(parentDoc); 
            })
            .fail(handleError);
        }
        
        return deferred.promise();
    }
    
    /**
     * Tries to find the name of the parent of the class defined in the current document by looking at the text after the word "extends"
     * e.g "class Bar extends Foo"
     * In this case the method will return "Foo"
     * 
     * @param   Document doc current document holding the class definition
     * @returns String
     */
    function getParentName(doc) {
        var lines = StringUtils.getLines(doc.getText());
        var parentName = null;
        var targetString = 'extends';

        var len = lines.length;
        for(var i=0;i<len;i++) {
            if(lines[i].match(targetString)) {
                parentName = lines[i].split(targetString).pop().trim();
                break;
            }
        }
        
        return parentName;
    }
    
    /**
     * Gets the file with name equal to name parameter and the extension of the file opened in the current document
     * 
     * @param   String     name filename without extension
     * @param   Document   doc  current document
     * @returns Promise
     */
    function findFile(name, doc) {
        var deferred = new $.Deferred();
        found = false;
        var curFile = doc.file;
        var ext = curFile.fullPath.split('.').pop();
        var targetFile = name + '.' + ext;
        var root = ProjectManager.getProjectRoot();
        
        console.log('start', found);
        searchDirectory(root, targetFile, deferred);
        console.log('found', found);
        if(!found) {
            deferred.reject('not found');
        }
        return deferred.promise();
    }
    
    /**
     * Recursively search directory specified by directory parameter for filename specified by targetFile parameter
     * 
     * @param Directory directory  directory to start from searching
     * @param String    targetFile name of file to search for
     * @param Deferred  deferred   deferred object to resolve with found File object
     */
    function searchDirectory(directory, targetFile, deferred) {
        
        directory.getContents(function(a,items) {
            
            items.forEach(function(item) {
                if(typeof item.getContents === 'function') {
                    searchDirectory(item, targetFile, deferred); 
                }
                if(FileUtils.compareFilenames(FileUtils.getBaseName(item.fullPath), targetFile) === 0) {
                    found = true;
                    deferred.resolve(item);
                }
            });
            
        });
    }
    
    /**
     * Open file in new tab
     
     * @param File file 
     */
    function openFile(file) {
        CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: file.fullPath})
        .done(function(file) {
            console.log(file);
        })
        .fail(handleError);
    }
    
    /**
     * Select line in document
     * 
     * @param Number     matchedLine 
     * @param Document   doc         
     */
    function selectLineInDoc(matchedLine, doc) {
        console.log('match: line', matchedLine, 'in doc', doc.file);
        
        var setCursor = function() {
            var editor = EditorManager.getActiveEditor();
            editor.setCursorPos(matchedLine, 0, true);
        };
        
        if(doc !== DocumentManager.getCurrentDocument()) {
            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: doc.file.fullPath})
            .done(setCursor)
            .fail(handleError);
        }
        else {
            setCursor();
        }
    }
    
    /**
     * Returns a promise which is resolved with the document for the file parameter
     *
     * @param   File   file 
     * @returns Promise
     */
    function getDocumentForFile(file) {
        return DocumentManager.getDocumentForPath(file.fullPath);
    }
    
    /**
     * Determine if string is a this-pointer
     
     * @param   String pointer 
     * @returns Boolean
     */
    function isThisPointer(pointer) {
        return pointer === '$this';
    }
    
    /**
     * Takes the object variable the method was called on as a string and tries to determine if it was instantiated with "new"
     * somewhere in the document. 
     * If this instantiation is found it returns the name of the class that was instantiated as a string.
     * 
     * @param   Document doc      current document to be searched
     * @param   String   object   the object variable the method was called on
     * @returns String            name of the instantiated class
     */
    function getMethodCallTarget(doc, object) {
        var lines = StringUtils.getLines(doc.getText());
        var len = lines.length;
        var obj;
        
        for(var i=0;i<len;i++) {
            var re = new RegExp("\\"+object+"(\\s)+=(\\s)+new");
            if(lines[i].match(re)) {
                obj = lines[i].split('new').pop().trim().replace(/[;\(\)]/, '');
                break;
            }
        }
        return obj;
    }
    
    /**
     * Start codeintel
     */
    function handleCodeIntel() {
        
        var editor = EditorManager.getActiveEditor();
        var curDoc = editor.document;
        var sel = getSelection(editor);
        var ext = FileUtils.getFileExtension(curDoc.file.fullPath);
        
        if('operator' in sel && sel.operator === operators[ext]) {
            console.log('find method', sel.text, 'called on', sel.object);
            
            // method called on this-pointer so search in file and inheritance tree
            if(isThisPointer(sel.object)) {
                findMethod(sel.text, curDoc) 
                .done(selectLineInDoc)
                .fail(handleError);
            }
            // method called on another object, see if this object is instantiated with "new" in the current file and if so, try to find the file in which this class 
            else {
                var obj = getMethodCallTarget(editor.document, sel.object);
                
                findFile(obj, curDoc)
                .then(getDocumentForFile)
                .then(function(doc) {
                    return findMethod(sel.text, doc);
                })
                .done(selectLineInDoc)
                .fail(handleError);
            }
        }
        else {
            findFile(sel.text, curDoc)
            .done(openFile)
            .fail(handleError);
        }
    }
    
    /**
     * Handle error, for now just log it to the console
     * @param Error
     */
    function handleError(e) {
        console.error(e);
    }


    // Register the command and shortcut
    CommandManager.register(
        NAVIGATE_CODEINTEL,
        CMD_CODEINTEL,
        handleCodeIntel
    );
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Ctrl-Alt-Space", "linux");
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Cmd-Shift-Space", "mac");
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Ctrl-Alt-Space", "win");
    
    // Create a menu item bound to the command
    var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuItem(CMD_CODEINTEL);
});
