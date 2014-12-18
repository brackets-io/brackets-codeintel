## Brackets codeintel

A [Brackets](http://brackets.io) extension which allows you to quickly navigate to classes and methods in any PHP file. 

When in a class definition file, it can find methods in the current file or in any parent classes. It can also find any class being instantiated in the current file, its methods and any parent classes.

## Installation

* Select **File > Extension Manager...** (or click the "brick" icon in the toolbar)
* Click **Install from URL...**
* Enter the url of this repo
  * https://github.com/DannyMoerkerke/brackets-codeintel
* Click **Install**

## How to use

Place the cursor inside the keyword you want to search for (or select it) and press "Ctrl-Alt-Space" or select **Navigate > CodeIntel**.
The keyword should be the name of a class or method or the variable that holds a class instance.

## Limitations

For Brackets CodeIntel to find class definition files, the name of the class should appear in the filename (which is good practice anyway...)
It can find a class by a variable that holds an instance of this class, but only if that class was instantiated with "new" in the current file. If the same variable name is used for different instances this might not work.

For example:


> $instance = new Foo;

> ...

> $instance = new Bar;

> $instance->action();


When the action() method is inspected CodeIntel will look for it in the Foo class (since it comes first in the code) instead of Bar, which might not be what you want.

Also, it cannot find a class by an instance variable that was returned from a method, like for example a factory.

## Version History

- 12/18/2014 v0.1.0 - Initial release.