"use strict";

import * as monaco from "monaco-editor";
import * as katex from "katex";
import {Content, details, div, span, tag, TagElement} from "../tags";
import {ArrayType, MapType, OptionalType, StructField, StructType} from "../../data/data_type";

export function displayContent(contentType: string, content: string | DocumentFragment, contentTypeArgs?: Record<string, string>): Promise<TagElement<any>> {
    const [mimeType, args] = contentTypeArgs ? [contentType, contentTypeArgs] : parseContentType(contentType);

    let result;
    if (mimeType === "text/html" || mimeType === "image/svg" || mimeType === "image/svg+xml" || content instanceof DocumentFragment) {
        const node = div(['htmltext'], []);
        if (content instanceof DocumentFragment) {
            node.appendChild(content);
        } else {
            node.innerHTML = content;
        }
        result = Promise.resolve(node);
    } else if (mimeType === "text/plain") {
        if (args.lang) {
            result = monaco.editor.colorize(content, args.lang, {}).then(html => {
                const node = (span(['plaintext', 'colorized'], []) as TagElement<"span", HTMLSpanElement & {"data-lang": string}>).attr('data-lang', args.lang);
                node.innerHTML = html;
                return node
            });
        } else {
            result = Promise.resolve(span(['plaintext'], [document.createTextNode(content)]));
        }

    } else if (mimeType === "application/x-latex" || mimeType === "application/latex") {
        const node = div([], []);
        katex.render(content, node, { displayMode: true, throwOnError: false });
        result = Promise.resolve(node);
    } else if (mimeType.startsWith("image/")) {
        const img = document.createElement('img');
        img.setAttribute('src', `data:${mimeType};base64,${content}`);
        result = Promise.resolve(img);
    } else {
        // what could it be? As a last resort we can just shove it in a data URL in an iframe and maybe the browser will deal with it?
        // we assume it's base64 encoded.
        const iframe = document.createElement('iframe');
        iframe.className = 'unknown-content';
        iframe.setAttribute("src", `data:${mimeType};base64,${content}`);
        result = Promise.resolve(iframe);
    }

    return result;
}

export function contentTypeName(contentType: string) {
    const [mime, args] = parseContentType(contentType);

    switch (mime) {
        case "text/plain": return "Text";
        case "text/html": return "HTML";
        case "image/svg": return "SVG";
        case "image/svg+xml": return "SVG";
        default:
            if (mime.startsWith("image/")) return "Image";
            return mime;
    }
}

export function parseContentType(contentType: string): [string, Record<string, string>] {
    const contentTypeParts = contentType.split(';').map(str => str.replace(/(^\s+|\s+$)/g, ""));
    const mimeType = contentTypeParts.shift()!;
    const args: Record<string, string> = {};
    contentTypeParts.forEach(part => {
        const [k, v] = part.split('=');
        args[k] = v;
    });

    return [mimeType, args];
}

export function truncate(string: any, len?: number) {
    len = len ?? 32;
    if (typeof string !== "string" && !(string instanceof String)) {
        string = string.toString();
    }
    if (string.length > len) {
        return string.substr(0, len - 1) + '…';
    }
    return string;
}

export function displayData(data: any, fieldName?: string, expandObjects: boolean | number = false) {
    const expandNext: boolean | number = typeof(expandObjects) === "number" ? (expandObjects > 0 ? expandObjects - 1 : false) : expandObjects;

    function shortDisplay(data: any) {
        if (data instanceof Array) {
            return span(['short-array'], ['Array(', data.length.toString(), ')']);
        } else if (typeof data === "number") {
            return span(['number'], [truncate(data.toString())]);
        } else if (typeof data === "boolean") {
            return span(['boolean'], [data.toString()]);
        } else if (typeof data === "object" && !(data instanceof String)) {
            return span(['short-object'], ['{…}']);
        } else {
            return span(['string'], [data.toString()]);
        }
    }

    if (data instanceof Array) {
        const summary = tag('summary', ['array-summary'], {}, ['Array(', data.length.toString(), ')']);
        if (fieldName) {
            summary.insertBefore(span(['field-name'], [fieldName]), summary.childNodes[0]);
        }
        const elems = tag('ul', ['array-elements'], {}, []);
        const details = tag('details', ['array-display'], {}, [summary, elems]);

        let count = 0;
        for (let elem of data) {
            if (count >= 99) {
                elems.appendChild(tag('li', ['more-elements'], {}, ['…', (data.length - count).toString(), ' more elements']));
                break;
            }
            count++;
            elems.appendChild(tag('li', [], {}, displayData(elem, undefined, expandNext)));
        }
        return details;
    } else if (data instanceof Map) {
        const summarySpan = span(['summary-content'], []);
        const summary = tag('summary', ['object-summary'], {}, [summarySpan]);
        if (fieldName) {
            summary.insertBefore(span(['field-name'], [fieldName]), summary.childNodes[0]);
        }
        summarySpan.appendChild(span([], ['…']));

        const fields = tag('ul', ['object-fields'], {}, []);
        const details = tag('details', ['object-display'], expandObjects ? { open: 'open' } : {}, [summary, fields]);

        for (let [key, val] of data) {
            fields.appendChild(tag('li', [], {}, [displayData(val, key, expandNext)]));
        }
        return details;
    } else if (data && typeof data === "object" && !(data instanceof String)) {
        const keys = Object.keys(data);
        const summarySpan = span(['summary-content'], []);
        const summary = tag('summary', ['object-summary'], {}, [summarySpan]);
        if (fieldName) {
            summary.insertBefore(span(['field-name'], [fieldName]), summary.childNodes[0]);
        }
        for (let key of keys) {
            if (summarySpan.textContent && summarySpan.textContent.length > 64) {
                summarySpan.addClass('truncated');
                break;
            }
            summarySpan.appendChild(shortDisplay(data[key]));
        }

        const fields = tag('ul', ['object-fields'], {}, []);
        const details = tag('details', ['object-display'], expandObjects ? { open: 'open' } : {}, [summary, fields]);

        for (let key of keys) {
            fields.appendChild(tag('li', [], {}, [displayData(data[key], key, expandNext)]));
        }
        return details;
    } else {
        let result;
        if (data !== null && data !== undefined) {
            switch (typeof data) {
                case "number": result = span(['number'], [truncate(data.toString())]); break;
                case "boolean": result = span(['boolean'], [data.toString()]); break;
                default: result = span(['string'], [data.toString()]);
            }
        } else if (data == null) {
            result = span(['null'], ['null'])
        } else {
            result = span(['undefined'], ['undefined'])
        }
        if (fieldName) {
            return span(['object-field'], [span(['field-name'], [fieldName]), result]);
        }
        return result;
    }
}

export function prettyDuration(milliseconds: number) {
    function quotRem(dividend: number, divisor: number) {
        const quotient = Math.floor(dividend / divisor);
        const remainder = dividend % divisor;
        return [quotient, remainder];
    }

    const [durationDays, leftOverHrs] = quotRem(milliseconds, 1000 * 60 * 60 * 24);
    const [durationHrs, leftOverMin] = quotRem(leftOverHrs, 1000 * 60 * 60);
    const [durationMin, leftOverSec] = quotRem(leftOverMin, 1000 * 60);
    const [durationSec, durationMs] = quotRem(leftOverSec, 1000);

    const duration = [];
    if (durationDays) {
        duration.push(`${durationDays}d`);
        duration.push(`${durationHrs}h`);
        duration.push(`${durationMin}m`);
        duration.push(`${durationSec}s`);
    } else if (durationHrs) {
        duration.push(`${durationHrs}h`);
        duration.push(`${durationMin}m`);
        duration.push(`${durationSec}s`);
    } else if (durationMin) {
        duration.push(`${durationMin}m`);
        duration.push(`${durationSec}s`);
    } else if (durationSec) {
        duration.push(`${durationSec}s`);
    } else if (durationMs) {
        duration.push(`${durationMs}ms`);
    }

    return duration.join(":")
}

export function displaySchema(structType: StructType): HTMLElement {

    function displayField(field: StructField): HTMLElement {
        if (field.dataType instanceof ArrayType) {
            const nameAndType = [
                span(['field-name'], [field.name]), ': ',
                span(['field-type'], [span(['bracket'], ['[']), field.dataType.element.typeName(), span(['bracket'], [']'])])];

            let description: Content = nameAndType;
            if (field.dataType.element instanceof StructType) {
                description = [details([], nameAndType, [displayStruct(field.dataType.element)])]
            } else if (field.dataType.element instanceof MapType) {
                description = [details([], nameAndType, [displayMap(field.dataType.element)])]
            }

            return tag("li", ['object-field', 'array-field'], {}, description);
        }

        if (field.dataType instanceof StructType) {
            return tag("li", ['object-field', 'struct-field'], {}, [
                details([], [span(['field-name'], [field.name]), ': ', span(['field-type'], ['struct'])], [
                    displayStruct(field.dataType)
                ])
            ]);
        }

        if (field.dataType instanceof MapType) {
            return tag("li", ['object-field', 'struct-field'], {}, [
                details([], [span(['field-name'], [field.name]), ': ', span(['field-type'], ['map'])], [
                    displayMap(field.dataType)
                ])
            ]);
        }

        if (field.dataType instanceof OptionalType) {
            return displayField(new StructField(field.name + "?", field.dataType.element));
        }

        const typeName = field.dataType.typeName();
        const attrs = {"data-fieldType": typeName} as any;
        return tag("li", ['object-field'], attrs, [
            span(['field-name'], [field.name]), ': ', span(['field-type'], [typeName])
        ]);
    }

    function displayStruct(typ: StructType): HTMLElement {
        return tag("ul", ["object-fields"], {}, typ.fields.map(displayField));
    }

    function displayMap(typ: MapType): HTMLElement {
        return tag("ul", ["object-fields", "map-type"], {}, [displayField(new StructField("key", typ.keyType)), displayField(new StructField("value", typ.valueType))]);
    }

    return div(['schema-display'], [
        details(
            ['object-display'],
            [span(['object-summary', 'schema-summary'], [span(['summary-content', 'object-field-summary'], [truncate(structType.fields.map(f => f.name).join(", "), 64)])])],
            [tag("ul", ['object-fields'], {}, structType.fields.map(displayField))]).attr('open', 'open')
    ]);
}