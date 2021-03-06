﻿using System;
using System.Linq;

namespace qc
{
    /// <summary>
    /// The parsed representation of a Quick control class declaration.
    /// </summary>
    public class MarkupControlClass : MarkupNode
    {
        private const string DEFAULT_CLASS_NAME = "Control";

        public string Name { get; set; }
        public string Script { get; set; }
        public string Style { get; set; }
        public string Tag { get; set; }
        public MarkupNode Content { get; set; }
        public MarkupControlInstance Prototype { get; set; }

        public MarkupControlClass()
        {
        }

        public MarkupControlClass(MarkupControlInstance control)
            : this(control, null, null)
        {
        }

        /// <summary>
        /// Elevate the specific control instance to a control class declaration.
        /// </summary>
        /// <remarks>
        /// The simplest way to parse the class definition is to parse it just
        /// like an instance of a control, then pull out specific properties
        /// for the name, prototype, script, and style.
        /// 
        /// The script and style properties are those which were separated out
        /// by the preprocessor before the control instance was parsed. These
        /// must now be folded into the control class declaration.
        /// </remarks>
        public MarkupControlClass(MarkupControlInstance c, string script, string style)
        {
            // Copy over the script and style separated out by the preprocessor.
            Script = script;
            Style = style;

            // Read the explicitly defined class properties.
            ExtractExplicitClassProperties(c);
            VerifyProperties();
        }

        public string Css()
        {
            return CssProcessor.CssForClass(this);
        }

        /// <summary>
        /// Return the JavaScript for this control class.
        /// </summary>
        public override string JavaScript(int indentLevel)
        {
            string renderFunction = EmitRenderFunction(indentLevel);
            if (!String.IsNullOrEmpty(Tag) && String.IsNullOrEmpty(renderFunction))
            {
                renderFunction = "null";    // Placeholder for render function parameter so we can specify tag.
            }
            return Template.Format(
                "//\n" +
                "// {ClassName}\n" +
                "//\n" +
                "{ClassName} = {BaseClassName}.subclass( \"{ClassName}\"{Comma1}{RenderFunction}{Comma2}{Tag}{Space});\n" +
                "{Script}\n", // Extra break at end helps delineate between successive controls in combined output.
                new
                {
                    ClassName = Name,
                    BaseClassName = BaseClassName,
                    Comma1 = String.IsNullOrEmpty(renderFunction) ? "" : ", ",
                    RenderFunction = renderFunction,
                    Comma2 = String.IsNullOrEmpty(Tag) ? "" : ", ",
                    Tag = String.IsNullOrEmpty(Tag) ? "" : ("\"" + Tag + "\" "),
                    Space = String.IsNullOrEmpty(renderFunction) ? " " : "",
                    Script = EmitScript()
                });
        }

        public string BaseClassName
        {
            get
            {
                return (Prototype != null) ? Prototype.ClassName : DEFAULT_CLASS_NAME;
            }
        }

        /// <summary>
        /// Extract explicitly declared class properties.
        /// </summary>
        /// <remarks>
        /// The parser will read a .qui file as if the whole thing were an instance
        /// of a class called Control with properties like "name" and "prototype".
        /// We translate those key properties into the relevant members of the
        /// ControlClass type.
        /// 
        /// Note: At this point, the script and style tags are highly unlikely
        /// to appear, having been previously separated out by the preprocessor.
        /// However, for completeness, we check here for those properties. The
        /// only way they could get this far were if they were set as attributes
        /// of the top-level Control node: <Control script="alert('Hi');"/> which
        /// would be pretty odd.
        /// </remarks>
        private void ExtractExplicitClassProperties(MarkupControlInstance control)
        {
            foreach (string propertyName in control.Properties.Keys)
            {
                MarkupNode node = control.Properties[propertyName];
                string text = (node is MarkupHtmlElement) ? ((MarkupHtmlElement) node).Html : null;

                switch (propertyName)
                {
                    case "name":
                        VerifyPropertyIsNull(propertyName, this.Name);
                        this.Name = text;
                        break;

                    case "content":
                        VerifyPropertyIsNull(propertyName, this.Content);
                        this.Content = node;
                        break;

                    case "prototype":
                        VerifyPropertyIsNull(propertyName, this.Prototype);
                        this.Prototype = VerifyPrototype(node);
                        break;

                    case "script":
                        VerifyPropertyIsNull(propertyName, this.Script);
                        this.Script = text;
                        break;

                    case "style":
                        VerifyPropertyIsNull(propertyName, this.Style);
                        this.Style = text;
                        break;

                    case "tag":
                        VerifyPropertyIsNull(propertyName, this.Tag);
                        this.Tag = text;
                        break;

                    default:
                        throw new CompilerException(
                            String.Format("Unknown class definition element: \"{0}\".", propertyName));
                }
            }
        }

        private string EmitRenderFunction(int indentLevel)
        {
            return (Content == null && Prototype == null)
                ? String.Empty
                : Template.Format(
                    "{Tabs}function render{ClassName}() {\n" +
                        "{Tabs}\tthis.properties({\n" +
                            "{BaseClassProperties}" +
                        "{Tabs}\t}, {BaseClassName} );\n" +
                    "{Tabs}}",
                    new {
                        Tabs = Tabs(indentLevel),
                        ClassName = Name,
                        BaseClassName = BaseClassName,
                        BaseClassProperties = EmitBaseClassProperties(indentLevel + 2)
                    });
        }

        /// <summary>
        /// Return the JavaScript for the control properties which will be set
        /// via calls to the base class.
        /// </summary>
        /// <remarks>
        /// This covers virtually all the properties (except className) which the
        /// developer will set on a control.
        /// </remarks>
        /// UNDONE: This function has evolved to be nearly identical to code in MarkupControlInstance,
        /// so those functions should probably be refactored and shared.
        private string EmitBaseClassProperties(int indentLevel)
        {
            if (Content != null)
            {
                return EmitBaseClassProperty("content", Content, indentLevel) + "\n";
            }

            // UNDONE: Write out prototype's content property first?
            return Prototype.Properties.Keys.Concatenate(propertyName =>
                EmitBaseClassProperty(propertyName, Prototype.Properties[propertyName], indentLevel), ",\n") + "\n";
        }

        private string EmitBaseClassProperty(string propertyName, MarkupNode propertyValue, int indentLevel)
        {
            return Template.Format(
               "{Tabs}\"{PropertyName}\": {PropertyValue}",
               new
               {
                   Tabs = Tabs(indentLevel),
                   PropertyName = propertyName,
                   PropertyValue = propertyValue.JavaScript(indentLevel)
               });
        }

        /// <summary>
        /// Return the control's script.
        /// </summary>
        /// <remarks>
        /// We also add back a final newline (which was stripped during reading)
        /// to make sure the generated code looks pretty.
        /// </remarks>
        private string EmitScript()
        {
            return String.IsNullOrEmpty(Script)
                ? String.Empty
                : Script.Trim() + "\n";
        }

        /// <summary>
        /// Throw an exception if the given property value is not null.
        /// </summary>
        private void VerifyPropertyIsNull(string propertyName, object propertyValue)
        {
            if (propertyValue != null)
            {
                throw new CompilerException(
                    String.Format("The \"{0}\" property can't be set more than once.", propertyName));
            }
        }

        // Perform final tests for a well-formed control.
        private void VerifyProperties()
        {
            if (String.IsNullOrEmpty(Name))
            {
                throw new CompilerException(
                    String.Format("No class \"name\" attribute was defined on the root <Control> element."));
            }

            if (Content != null && Prototype != null)
            {
                throw new CompilerException(
                    String.Format("A control can't define both content and a prototype."));
            }
        }

        /// <summary>
        /// Ensure the prototype is well-formed.
        /// </summary>
        private MarkupControlInstance VerifyPrototype(MarkupNode node)
        {
            if (node is MarkupControlInstance)
            {
                return (MarkupControlInstance) node;
            }
            if (node is MarkupElementCollection)
            {
                // There should be only one non-whitespace node in the collection.
                try
                {
                    MarkupElement element = ((MarkupElementCollection) node)
                        .Single(item => !item.IsWhiteSpace());
                    if (element is MarkupControlInstance)
                    {
                        return (MarkupControlInstance) element;
                    }
                }
                catch (InvalidOperationException)
                {
                }
            }

            throw new CompilerException(
                "A control's <prototype> must be a single instance of a QuickUI control class.");
        }
    }
}
