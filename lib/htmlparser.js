/*
 * HTML Parser By John Resig (ejohn.org)
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 *
 * // Use like so:
 * HTMLParser(htmlString, {
 *     start: function(tag, attrs, unary) {},
 *     end: function(tag) {},
 *     chars: function(text) {},
 *     comment: function(text) {}
 * });
 *
 * // or to get an XML string:
 * RewriteHtml(htmlString);
 *
 */
 //exports.RewriteHtml = function( html ,request,tran_url_fun) {
 RewriteHtml = function( html ,request,tran_url_fun) {
    var results = "";
    
    HTMLParser(html, {
        start: function( tag, attrs, unary ) {
            results += "<" + tag;
    
            for ( var i = 0; i < attrs.length; i++ )
            {
                if(g_html_rules[tag] && g_html_rules[tag][attrs[i].name])
                {
                    if(tag.toLowerCase() == "meta" && attrs[i].name.toLowerCase() == 'content')
                    {
                        var isRefresh = false;
                        for(var j=0;j<attrs.length;j++)
                        {
                            if(attrs[j].name.toLowerCase() == 'http-equiv' && attrs[j].escaped.toLowerCase() == 'refresh')
                            {
                                isRefresh = true;
                                break;
                            }
                            
                        }
                        
                        if(isRefresh)
                        {
                            attrs[i].escaped = attrs[i].escaped.replace(/(url=)(.+)$/i, function($0,$1,$2){return ($1+tran_url_fun($2,request));});
                            results += " " + attrs[i].name + '="' + attrs[i].escaped + '"';
                            continue;
                        }
                    }
                    attrs[i].escaped = tran_url_fun(attrs[i].escaped,request);
                }
                
                results += " " + attrs[i].name + '="' + attrs[i].escaped + '"';
            }
    
            results += (unary ? "/" : "") + ">";
        },
        end: function( tag ) {
            results += "</" + tag + ">";
        },
        chars: function( text ) {
            results += text;
        },
        comment: function( text ) {
            results += "<!--" + text + "-->";
        }
    });
    
    return results;
};
// Regular Expressions for parsing tags and attributes
var startTag = /^<([-A-Za-z0-9_]+)((?:\s+[-\w]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
    endTag = /^<\/([-A-Za-z0-9_]+)[^>]*>/,
    attr = /([-A-Za-z0-9_]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|([^>\s]+)))?/g;
    
// Empty Elements - HTML 4.01
var empty = makeMap("area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed");

// Block Elements - HTML 4.01
var block = makeMap("address,applet,blockquote,button,center,dd,del,dir,div,dl,dt,fieldset,form,frameset,hr,iframe,ins,isindex,li,map,menu,noframes,noscript,object,ol,p,pre,script,table,tbody,td,tfoot,th,thead,tr,ul");

// Inline Elements - HTML 4.01
var inline = makeMap("a,abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code,del,dfn,em,font,i,iframe,img,input,ins,kbd,label,map,object,q,s,samp,script,select,small,span,strike,strong,sub,sup,textarea,tt,u,var");

// Elements that you can, intentionally, leave open
// (and which close themselves)
var closeSelf = makeMap("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr");

// Attributes that have their values filled in disabled="disabled"
var fillAttrs = makeMap("checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected");

// Special Elements (can contain anything)
var special = makeMap("script,style");

var g_html_rules = {
    img:{src:1},
    href:{href:1},
    meta:{content:1}
}

var HTMLParser = this.HTMLParser = function( html, handler ) {
    var index, chars, match, stack = [], last = html;
    stack.last = function(){
        return this[ this.length - 1 ];
    };

    while ( html ) {
        chars = true;

        // Make sure we're not in a script or style element
        if ( !stack.last() || !special[ stack.last() ] ) {

            // Comment
            if ( html.indexOf("<!--") == 0 ) {
                index = html.indexOf("-->");

                if ( index >= 0 ) {
                    if ( handler.comment )
                        handler.comment( html.substring( 4, index ) );
                    html = html.substring( index + 3 );
                    chars = false;
                }

            // end tag
            } else if ( html.indexOf("</") == 0 ) {
                match = html.match( endTag );

                if ( match ) {
                    html = html.substring( match[0].length );
                    match[0].replace( endTag, parseEndTag );
                    chars = false;
                }

            // start tag
            } else if ( html.indexOf("<") == 0 ) {
                var docTypeTag = "<!DOCTYPE "
                if(html.substr(0,docTypeTag.length).toLowerCase() == docTypeTag.toLowerCase()){
                    index = html.indexOf('>')
                    if(index < 0)
                        throw "Parse Error:doctype invalid!";
                    
                    ++index;
                    var text = html.substring( 0, index );
                    
                    if ( handler.chars )
                        handler.chars( text );
                        
                    html = html.substr( index );
                    chars = false;
                }
                else if ( match = html.match( startTag )) {
                    html = html.substring( match[0].length );
                    match[0].replace( startTag, parseStartTag );
                    chars = false;
                }
            }

            if ( chars ) {
                index = html.indexOf("<");
                
                var text = index < 0 ? html : html.substring( 0, index );
                html = index < 0 ? "" : html.substring( index );
                
                if ( handler.chars )
                    handler.chars( text );
            }

        } else {
            html = html.replace(new RegExp("([\\s\\S]*)<\/" + stack.last() + "[^>]*>"), function(all, text){
                text = text.replace(/<!--([\s\S]*?)-->/g, "$1")
                    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");

                if ( handler.chars )
                    handler.chars( text );

                return "";
            });

            parseEndTag( "", stack.last() );
        }

        if ( html == last )
            throw "Parse Error: " + html;
        last = html;
    }
    
    // Clean up any remaining tags
    parseEndTag();

    function parseStartTag( tag, tagName, rest, unary ) {
        tagName = tagName.toLowerCase();

        if ( block[ tagName ] ) {
            while ( stack.last() && inline[ stack.last() ] ) {
                parseEndTag( "", stack.last() );
            }
        }

        if ( closeSelf[ tagName ] && stack.last() == tagName ) {
            parseEndTag( "", tagName );
        }

        unary = empty[ tagName ] || !!unary;

        if ( !unary )
            stack.push( tagName );
        
        if ( handler.start ) {
            var attrs = [];

            rest.replace(attr, function(match, name) {
                var value = arguments[2] ? arguments[2] :
                    arguments[3] ? arguments[3] :
                    arguments[4] ? arguments[4] :
                    fillAttrs[name] ? name : "";
                
                attrs.push({
                    name: name,
                    value: value,
                    escaped: value.replace(/(^|[^\\])"/g, '$1\\\"') //"
                });
            });

            if ( handler.start )
                handler.start( tagName, attrs, unary );
        }
    }

    function parseEndTag( tag, tagName ) {
        // If no tag name is provided, clean shop
        if ( !tagName )
            var pos = 0;
            
        // Find the closest opened tag of the same type
        else
            for ( var pos = stack.length - 1; pos >= 0; pos-- )
                if ( stack[ pos ] == tagName )
                    break;
        
        if ( pos >= 0 ) {
            // Close all the open elements, up the stack
            for ( var i = stack.length - 1; i >= pos; i-- )
                if ( handler.end )
                    handler.end( stack[ i ] );
            
            // Remove the open elements from the stack
            stack.length = pos;
        }
    }
};


function makeMap(str){
    var obj = {}, items = str.split(",");
    for ( var i = 0; i < items.length; i++ )
        obj[ items[i] ] = true;
    return obj;
}

