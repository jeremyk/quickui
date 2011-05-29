/*
 * QuickUI
 * Version 0.8.2
 * Modular web control framework
 * http://quickui.org/
 *
 * Copyright (c) 2009-2011 Jan Miksovsky
 * Licensed under the MIT license.
 *
 */

 
/*
 * QuickUI "control" jQuery extension to create and manipulate
 * controls via a regular jQuery instance.
 * 
 * Usage:
 * 
 * $(element).control()
 *         Returns the control that was created on that element.
 *
 * $(element).control({ content: "Hello" });
 *      Sets the content property of the control at this element.
 * 
 * $(element).control(MyControlClass);
 *         Creates a new instance of MyControlClass around the element(s).
 * 
 * $(element).control(MyControlClass, { content: "Hello" });
 *         Creates new control instance(s) and sets its (their) content property.
 * 
 */
jQuery.fn.control = function(arg1, arg2) {
    if (arg1 === undefined)
    {
        // Return the controls bound to these element(s), cast to the correct class.
		var $cast = Control(this).cast(jQuery);
		return ($cast instanceof Control) ? $cast : null;
    }
    else if (jQuery.isFunction(arg1))
    {
        // Create a new control around the element(s).
        var controlClass = arg1;
        var properties = arg2;
    	var $controls = this.each(function(index, element) {
	        controlClass.createAt(element, properties);
    	});
    	
    	// Return the control array as an instance of the desired class.
        return controlClass($controls);
    }
    else
    {
        // Set properties on the control(s).
        var properties = arg1;
        return Control(this).cast().properties(properties);
    }
};

/*
 * Control subclass of jQuery.
 * 
 * This is used as the base class for all QuickUI controls.
 */
var Control = jQuery.sub();
jQuery.extend(Control, {
	
	/*
	 * Given an array of functions, repeatedly invoke them as a chain.
	 * TODO: More documentation.
	 */
	bindTo: function() {
	    
	    // Check for side effect function as last parameter.
	    var args = arguments;
	    var sideEffectFn;
	    if ($.isFunction(args[args.length - 1]))
	    {
            // Convert arguments to a real array
            var args = [].slice.call(arguments);
            var sideEffectFn = args.pop();
	    }
	    
	    // Identify function names and optional parameters.
		var functionNames = [];
		var functionParams = [];
		for (var i = 0; i < args.length; i++)
		{
		    // Check for parameter.
		    var parts = arguments[i].split("/");
		    functionNames[i] = parts.shift();
		    functionParams[i] = parts;
		}
		
		return function binding(value) {
		    
			var result = this;
			for (var i = 0; i < functionNames.length; i++)
			{
			    var fn = result[functionNames[i]];
			    var params = functionParams[i];
			    if (value !== undefined)
			    {
			        // Invoking as setter.
			        params = params.concat([ value ]);
			    }
                if (fn === undefined) {
                    var message = "Tried to access undefined getter/setter function \"" + functionNames[i] + "\" on control class \"" + this.className + "\".";
                    throw message;
                }
				result = fn.apply(result, params);
			}
			
			if (value !== undefined && sideEffectFn)
			{
			    sideEffectFn.call(this, value);
			}
			
			return result;
		};
	},
		

    /*
     * Return the names of all control classes in this class' hierarchy,
     * in order from most specific to most general class.
     * 
     * Example: If a control class Foo has superclasses Bar and Control,
     * this returns "Foo Bar Control".
     */
    classHierarchy: function(startingClass) {
        var controlClass = startingClass || this;
        if (!(controlClass && controlClass.prototype && controlClass.prototype.className))
        {
            return "";
        }
        if (!controlClass._classHierarchy)          // Already have memoized result?
        {
            var result = controlClass.prototype.className;
            var superClassNames = this.classHierarchy(controlClass.superclass);
            if (superClassNames.length > 0)
            {
                result += " " + superClassNames;
            }
            controlClass._classHierarchy = result;  // Memoize result
        }
        return controlClass._classHierarchy;
    },
    
    /*
     * Create an instance of this control class around a default element.
     * The class prototype's tag member can define a specific element tag. 
     */
    create: function(properties) {
    	var $target = $("<" + this.prototype.tag + "/>");
    	return this.createAt($target, properties);
    },
	
	/*
	 * Create instance(s) of this control class around the given target(s).
	 */
    createAt: function(target, properties) {

        // Instantiate the control class.
        var $controls = this(target);
		
        // Grab the existing contents of the target elements.
        var oldContents = $controls.map(function(index, element) {
            var content = jQuery.trim($(element).html());
            return content.length > 0 && content;
        }).get();
        
        $controls
            // Bind elements to the control class.
        	.data("_controlClass", this)
            
            // Apply all class names in the class hierarchy as style names.
            // This lets the element pick up styles defined by those classes.
            .addClass(this.classHierarchy())
            
            // Render controls as DOM elements.
            .render()
            
            // Set any requested properties.
            .properties(properties)

            // Pass in the target's old contents (if any).            
            .multiProperty("content", oldContents)
        
            // Tell the controls they're ready.
            .initialize();

		return $controls;
    },

    // Return true if the given element is a control.    
    isControl: function(element) {
        return (Control(element).control() !== undefined);
    },
    
    /*
     * Generic factory for a property getter/setter.
     */
    property: function(sideEffectFn, defaultValue, converterFunction) {
        var backingPropertyName = "_property" + Control.property._symbolCounter++;
        return function(value) {
            var result;
            if (value === undefined)
            {
                // Getter
                result = this.data(backingPropertyName);
                return (result === undefined)
                    ? defaultValue
                    : result;
            }
            else
            {
                // Setter. Allow chaining.
                return this.eachControl(function(index, $control) {
                    result = (converterFunction !== undefined)
                        ? converterFunction.call($control, value)
                        : value;
                    $control.data(backingPropertyName, result);
                    if (sideEffectFn) {
                        sideEffectFn.call($control, result);            
                    }
                })
            }
        };
    },
    
	// Create a subclass of this class.
	subclass: function(className, renderFunction, tag) {
		var superClass = this;
		var newClass = superClass.sub();
		
		// jQuery.sub uses $.extend to copy properties from super to subclass;
		// need to blow away class properties that shouldn't have been copied.
		delete newClass._classHierarchy;
		delete newClass._initializeQueue;
		
		newClass.prototype.className = className
		if (renderFunction)
		{
			newClass.prototype.render = function() {
			    superClass.prototype.render.call(this);
			    // Call the render function on each element separately to
			    // ensure each control ends up with its own element references.
			    for (var i = 0; i < this.length; i++)
			    {
                    renderFunction.call(this.eq(i));
			    }
			    //renderFunction.call(this);
			    return this;
			}
	    }
	    if (tag)
	    {
	    	newClass.prototype.tag = tag;
	    }
	    
		newClass.subclass = superClass.subclass;
		return newClass;
	},
	
	// Return true if class1 is a subclass of class2.
	_isSubclassOf: function(class1, class2) {
		var superClass = class1.superclass;
		if (superClass === undefined)
		{
			return false;
		}
		else if (superClass === class2)
		{
			return true;
		}
		else
		{
			return this._isSubclassOf(superClass, class2);
		}
	}
});

/*
 * Control instance methods.
 */
jQuery.extend(Control.prototype, {
            
    /*
     * Get/set whether the indicated class(es) are applied to the elements.
     * This effectively combines $.hasClass() and $.toggleClass() into a single
     * getter/setter.
     */
    applyClass: function(classes, value) {
        return (value === undefined)
            ? this.hasClass(classes)
            : this.toggleClass(classes, value);
    },
    	
	/*
	 * Return the array of elements cast to their closest JavaScript class ancestor.
	 * E.g., a jQuery $(".foo") selector might pick up instances of control classes
	 * A, B, and C. If B and C are subclasses of A, this will return an instance of
	 * class A. So Control(".foo").cast() does the same thing as A(".foo"), but without
	 * having to know the type of the elements in advance.
	 * 
	 * The highest ancestor class this will return is the current class, even for plain
	 * jQuery objects, in order to allow Control methods (like content()) to be applied to
	 * the result.
	 */
	cast: function(defaultClass) {
		defaultClass = defaultClass || this.constructor;
		var $set = $();
		var setClass;
		this.each(function(index, element) {
			var $element = $(element);
			var elementClass = $element.data("_controlClass") || defaultClass;
			if (setClass === undefined)
			{
				setClass = elementClass;
			}
			else if (elementClass === setClass || Control._isSubclassOf(elementClass, setClass))
			{
				// Already have most common class.
			}
			else if (Control._isSubclassOf(setClass, elementClass))
			{
				setClass = elementClass;
			}
			$set = $set.add($element);
		});
		setClass = setClass || defaultClass;  // In case "this" had no elements.
		return setClass($set);
	},
    
    /*
     * The set of classes on the control's element.
     * If no value is supplied, this gets the current list of classes.
     * If a value is supplied, the specified class name(s) are *added*
     * to the element. This is useful for allowing a class to be added
     * at design-time to an instance, e.g., <Foo class="bar"/>. The
     * resulting element will end up with "bar" as a class, as well as
     * the control's class hierarchy: <div class="Foo Control bar">.
     * 
     * Note that, since "class" is a reserved word in JavaScript, we have
     * to quote it. 
     */
    "class": function(classList) {
        if (classList !== undefined)
        {
            this.toggleClass(classList, true);
        }
        return this.attr("class");
    },

    className: "Control",
	
    /*
     * Get/set the content of an HTML element.
     * 
     * Like $.contents(), but you can also set content, not just get it.
     * You can set content to a single item, an array of items, or a set
     * of items listed as parameters. Setting multiple items at a time
     * is an important case in compiled QuickUI markup. Input elements
     * are also handled specially: their value (val) is their content.
     * 
     * This function attempts to return contents in a canonical form, so
     * that setting contents with common parameter types is likely to
     * return those values back in the same form. If there is only one
     * content element, that is returned directly, instead of returning
     * an array of one element. If the element being returned is a text node,
     * it is returned as a string.
     * 
     * Usage:
     *  $element.content("Hello")              // Simple string
     *  $element.content(["Hello", "world"])   // Array
     *  $element.content("Hello", "world")     // Parameters
     *  Control("<input type='text'/>").content("Hi")   // Sets text value
     * 
     * This is used as the default implementation of a control's content
     * property. Controls can override this behavior.
     */
	content: function(value) {
        if (value === undefined)
        {
            // Getting contents. Just process first element.
            var $element = this.eq(0);
            if ($element.isInputElement())
            {
                // Return input element value.
                return $element.val();
            }
            else
            {
                // Return HTML contents in a canonical form.
                var contents = $element.contents(value);
                var result = jQuery.map(contents, function(item) {
                    return (item.nodeType == 3)
                        ? item.nodeValue // Return text as simple string
                        : item;
                });
                return (result != null && result.length == 1)
                    ? result[0] // Return the single content element.
                    : result;
            }
        }
        else
        {
            // Setting contents.
            
            // Cast arguments to an array.
            var array = (arguments.length > 1)
                ? arguments                 // set of parameters
                : jQuery.isArray(value)
                    ? value                 // single array parameter
                    : [ value ];            // singleton parameter

            this.each(function(index, element) {
                var $element = Control(element);
                if ($element.isInputElement())
                {
                    // Set input element value.
                    $element.val(value);
                }
                else
                {
                    // Set HTML contents.
                    $element.empty();
                    // $.append() wants params; use apply to cast.
                    $element.append.apply($element, array);
                }
            });
            return this;
        }
	},
	
	/*
	 * Execute a function once for each control in the array.
	 * Inside the function, "this" refers to the single control.
	 */
	eachControl: function(fn) {
	    for (var i = 0; i < this.length; i++)
	    {
	        var $control = this.eq(i);
	        var result = fn.call($control, i, $control);
	        if (result === false)
	        {
	            break;
	        }
	    }
	    return this;
	},

    id: function(id) {
        return this.attr("id", id);
    },

    /*
     * Invoked when the control has finished rendering.
     * Subclasses can override this to perform their own post-rendering work
     * (e.g., wiring up events).
     */    
    initialize: function() {},
	
    // Return true if the (first) element is an input element (with a val).
    isInputElement: function() {
        var inputTags = ["input", "select", "textarea"];
        var nodeName = this[0].nodeName.toLowerCase();
        return (jQuery.inArray(nodeName, inputTags) >= 0);
    },

	/*
	 * Define control methods as iterators over a jQuery array.
	 * This is similar to jQuery.extend(), but functions defined in this way
	 * will be automatically wrapped such that they: a) implicitly iterate over
	 * "this", and b) implicitly dereference controls.
	 */
	iterators: function(members) {
		for (member in members) {
			var value = members[member];
			this[member] = this._createIterator(value);
		}
	},
	
    /*
     * Base Control class has no visualization of its own.
     */    
    render: function() {
        return this;
    },

    /*
     * Get/set the given property on mulitple elements at once. If called
     * as a getter, an array of the current property values is returned.
     * If called as a setter, the property of each element will be set to
     * the corresponding defined member of the values array. (Array values
     * which are undefined will not be set.)
     */
    multiProperty: function(propertyName, values) {
        var propertyFn = this[propertyName];
        if (values === undefined)
        {
            // Getter
            var results = [];
            for (var i = 0; i < this.length; i++) {
                results[i] = propertyFn.call(this.eq(i));
            }
            return results;
        }
        else
        {
            // Setter
            for (var i = 0; i < this.length; i++)
            {
                if (!!values[i])
                {
                    propertyFn.call(this.eq(i), values[i]);
                }
            }
            return this;
        }
    },
	
	/*
	 * Invoke the indicated setter functions on the control to
	 * set control properties. E.g.,
	 * 
	 *    $c.properties({ foo: "Hello", bar: 123 });
	 * 
	 * will call $c.foo("Hello") and $c.bar(123).
	 * 
	 * The setAsClass parameter allows setting properties defined by
	 * the given superclass.
	 */
	properties: function(properties, setAsClass) {
		var classFn = setAsClass || this.constructor;
		var prototype = classFn.prototype;
	    for (var propertyName in properties)
	    {
            if (prototype[propertyName] === undefined) {
                var message = "Tried to access undefined getter/setter function for property \"" + propertyName + "\" on control class \"" + this.className + "\".";
                throw message;
            }
	        var value = properties[propertyName];
	        prototype[propertyName].call(this, value);
	    }
	    return this;
	},
    
    /*
     * Sets/gets the style of matching elements.
     * This lets one specify a style attribute in Quick markup for a control instance;
     * the style will apply to the control's root element.
     */
    style: function(value)
    {
        return this.attr("style", value);
    },
        
    /*
     * By default, the root tag of the control will be a div.
     * Control classes can override this: <Control name="Foo" tag="span">
     */
    tag: "div",
    
    /*
     * Toggle the element's visibility.
     * Like $.toggle(), but if no value is supplied, the current visibility is returned
     * (rather than toggling the element's visibility).
     */
    visibility: function(value) {
        return (value === undefined)
            ? this.is(":visible")
            : this.toggle(value);
    },
	
	/*
	 * Convert a function into an interator that loops over the elements of
	 * a jQuery array. If the inner function returns a defined value, then
	 * the function is assumed to be a property getter, and that result is
	 * return immediately. Otherwise, "this" is returned to permit chaining.
	 * 
	 * Used by Control.define().
	 */
	_createIterator: function(fn) {
		return function() {
			var args = arguments;
			var iteratorResult;
			this.eachControl(function(index, $control) {
				var result = fn.apply($control, args);
				if (result !== undefined)
				{
					iteratorResult = result;
					return false;
				}
			});
			return (iteratorResult !== undefined)
				? iteratorResult // Getter
				: this // Method or setter;
		};
	},
    
    /*
     * Return a jQuery element for the given content (either HTML or a DOM element)
     * that will be part of a control. At the same time, define a function on the
     * control class that can be used later to get that element back.
     * 
     * This is an internal routine invoked by a control class' generated
     * code whenever the control is rendered. The function defined herein is only
     * created the first time this routine is called.
     */
    _define: function(functionName, content) {
        
        var $element = $(content);
        
        // Store the element reference as data on the control.
        this.data(functionName, $element[0]);
        
        if (this[functionName] === undefined)
        {
            // Define a control class function to get back to the element(s) later.
            this.constructor.prototype[functionName] = (function(key) {
                return function() {
                    // Map a collection of control instances to the given element
                    // defined for each instance.
                    var $result = Control();
                    for (var i = 0; i < this.length; i++) {
                        var element = this.eq(i).data(key);
                        $result = $result.add(element);
                    }
                    return $result.cast();
                };
            })(functionName);
        }
        
        return $element;
    }

});

/*
 * More factories for getter/setters of various types.
 */
jQuery.extend(Control.property, {
    
    // A boolean property.
    bool: function(setterFunction, defaultValue) {
        return Control.property(
            setterFunction,
            defaultValue,
            function(value) {
                // Convert either string or bool to bool.
                return String(value) == "true";
            }
        );
    },
    
    // A date-valued property. Accepts a JavaScript date or parseable date string.
    date: function(setterFunction, defaultValue) {
        return Control.property(
            setterFunction,
            defaultValue,
            function(value) {
                return value instanceof Date
                    ? value
                    : new Date(Date.parse(value));
            }
        );
    },
        
    // An integer property.
    integer: function(setterFunction, defaultValue) {
        return Control.property(
            setterFunction,
            defaultValue,
            parseInt
        );
    },

    // Used to generate symbols to back new properties.
    _symbolCounter: 0

});
