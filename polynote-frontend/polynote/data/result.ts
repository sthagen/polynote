'use strict';

import {
    Codec, DataReader, DataWriter, discriminated, combined, arrayCodec, optional,
    str, tinyStr, uint8, uint16, int32, CodecContainer, int16, int64
} from './codec'

import {ValueRepr, StringRepr} from './value_repr'
import * as monaco from "monaco-editor";

export class Result extends CodecContainer {
    static codec: Codec<Result>;
    static codecs: typeof Result[];
    static msgTypeId: number;

    static decode(data: ArrayBuffer | DataView) {
        return Codec.decode(Result.codec, data);
    }

    static encode(msg: Result) {
        return Codec.encode(Result.codec, msg);
    }
}

export class Output extends Result {
    static codec = combined(str, arrayCodec(int32, str)).to(Output);
    static get msgTypeId() { return 0; }

    static unapply(inst: Output): ConstructorParameters<typeof Output> {
        return [inst.contentType, inst.content];
    }

    constructor(readonly contentType: string, readonly content: string[]) {
        super(contentType, content);
        Object.freeze(this);
    }
}

export class Position {
    static codec = combined(str, int32, int32, int32).to(Position);
    static unapply(inst: Position): ConstructorParameters<typeof Position> {
        return [inst.source, inst.start, inst.end, inst.point];
    }

    constructor(readonly source: string, readonly start: number, readonly end: number, readonly point: number) {
        Object.freeze(this);}
}

export class KernelReport {
    static codec = combined(Position.codec, str, int32).to(KernelReport);
    static unapply(inst: KernelReport): ConstructorParameters<typeof KernelReport> {
        return [inst.position, inst.message, inst.severity];
    }

    constructor(readonly position: Position, readonly message: string, readonly severity: number) {
        Object.freeze(this);
    }

    get isError() {
        return this.severity === 2;
    }
}

export class CompileErrors extends Result {
    static codec = combined(arrayCodec(int32, KernelReport.codec)).to(CompileErrors);
    static get msgTypeId() { return 1; }

    static unapply(inst: CompileErrors): ConstructorParameters<typeof CompileErrors> {
        return [inst.reports];
    }

    constructor(readonly reports: KernelReport[]) {
        super();
        Object.freeze(this);
    }
}


// maps to JVM stack trace element
export class StackTraceElement {
    static codec = combined(str, str, str, int32).to(StackTraceElement);
    static unapply(inst: StackTraceElement): ConstructorParameters<typeof StackTraceElement> {
        return [inst.className, inst.method, inst.file, inst.line];
    }

    constructor(readonly className: string, readonly method: string, readonly file: string, readonly line: number) {
        Object.freeze(this);
    }
}

// maps to JVM Throwable
// WARNING: not frozen (mutable)
export class ServerError {
    static codec = combined(str, str, arrayCodec(uint16, StackTraceElement.codec)).to(ServerError);
    static unapply(inst: ServerError): ConstructorParameters<typeof ServerError> {
        return [inst.className, inst.message, inst.stackTrace];
    }

    public id: string;
    public extraContent: string;

    constructor(public className: string, public message: string, public stackTrace: StackTraceElement[]) {
        this.className = className;
        this.message = message;
        this.stackTrace = stackTrace;
        if (this.className.includes("UnrecoverableError")) {
            this.id = "Unrecoverable Error";
            this.extraContent = "Polynote encountered an unrecoverable error. Please reload your browser window to continue :-(";
        } else {
            this.id = "Kernel Error";
            this.extraContent = "Please see the console for more details";
        }
    }
}

export class ServerErrorWithCause {
    static codec = Codec.map<ServerError[], ServerErrorWithCause | null>(
        arrayCodec(uint8, ServerError.codec),
        (kernelErrors: ServerError[]) => {
            if (kernelErrors.length === 0) return null;

            let i = kernelErrors.length - 1;
            let current = new ServerErrorWithCause(kernelErrors[i].className, kernelErrors[i].message, kernelErrors[i].stackTrace);

            while (i > 0) {
                const next = kernelErrors[--i];
                current = new ServerErrorWithCause(next.className, next.message, next.stackTrace, current);
            }
            return current;
        },
        (withCause: ServerErrorWithCause | null) => {
            if (withCause == null) return [];
            const errs = [];
            let current: ServerErrorWithCause | undefined = withCause;
            let i = 0;
            while (i < 16 && current != null) {
                errs.push(new ServerError(current.className, current.message, current.stackTrace));
                current = current.cause;
                i++;
            }

            return errs;
        }
    );
    static unapply(inst: ServerErrorWithCause): ConstructorParameters<typeof ServerErrorWithCause> {
        return [inst.className, inst.message, inst.stackTrace, inst.cause];
    }

    constructor(readonly className: string, readonly message: string, readonly stackTrace: StackTraceElement[], readonly cause?: ServerErrorWithCause) {
        Object.freeze(this);
    }
}


export class RuntimeError extends Result {
    static codec = combined(ServerErrorWithCause.codec).to(RuntimeError);
    static get msgTypeId() { return 2; }

    static unapply(inst: RuntimeError): ConstructorParameters<typeof RuntimeError> {
        return [inst.error];
    }

    constructor(readonly error: ServerErrorWithCause) {
        super();
        Object.freeze(this);
    }

    static fromJS = (err: Error) => new RuntimeError(new ServerErrorWithCause(err.constructor.name, err.message || err.toString(), []));
}

export class ClearResults extends Result {
    static codec = Object.freeze({
        encode: (value: ClearResults, writer: DataWriter) => undefined,
        decode: (reader: DataReader) => ClearResults.instance
    });
    static get msgTypeId() { return 3; }

    static unapply(inst: ClearResults): ConstructorParameters<typeof ClearResults> {
        return [];
    }

    constructor() {
        super();
        Object.freeze(this);
    }

    static instance = new ClearResults();
}


export class PosRange {
    static codec = combined(int32, int32).to(PosRange);
    static unapply(inst: PosRange): ConstructorParameters<typeof PosRange> {
        return [inst.start, inst.end];
    }

    constructor(readonly start: number, readonly end: number) {
        Object.freeze(this);
    }

    get reversed() {
        return new PosRange(this.end, this.start);
    }

    get toString() {
        return `${this.start}-${this.end}`
    }

    get length() {
        return Math.abs(this.end - this.start);
    }

    toMRange(model: monaco.editor.IModel): monaco.Range {
        return monaco.Range.fromPositions(model.getPositionAt(this.start), model.getPositionAt(this.end))
    }

    equals(other: PosRange): Boolean {
        return this.start === other.start && this.end === other.end
    }

    static fromString(serialized: string): PosRange {
        const [start, end] = serialized.split("-");
        return new PosRange(parseInt(start), parseInt(end));
    }

    static fromRange(range: monaco.Range, model: monaco.editor.IModel) {
        const start = model.getOffsetAt(range.getStartPosition());
        const end = model.getOffsetAt(range.getEndPosition());
        return new PosRange(start, end)
    }
}


export class ResultValue extends Result {
    static codec = combined(tinyStr, tinyStr, arrayCodec(uint8, ValueRepr.codec), int16, optional(PosRange.codec)).to(ResultValue);
    static get msgTypeId() { return 4; }

    static unapply(inst: ResultValue) {
        return [inst.name, inst.typeName, inst.reprs, inst.sourceCell, inst.pos];
    }

    constructor(readonly name: string, readonly typeName: string, readonly reprs: ValueRepr[], readonly sourceCell: number, readonly pos?: PosRange) {
        super();
        Object.freeze(this);
    }

    get valueText() {
        const index = this.reprs.findIndex(repr => repr instanceof StringRepr);
        if (index < 0) return "";
        return (this.reprs[index] as StringRepr).string;
    }
}



/**
 * A result originating on the client, from a client-side interpreter. It has to tell us how to display itself and
 * how it should be saved in the notebook.
 */
export class ClientResult extends Result {
    constructor() {
        super();
    }

    display(targetEl: HTMLElement) {
        throw new Error(`Class ${this.constructor.name} does not implement display()`);
    }

    toOutput(): Promise<Output> {
        throw new Error(`Class ${this.constructor.name} does not implement toOutput()`);
    }
}

export class ExecutionInfo extends Result {
    static codec = combined(int64, optional(int64)).to(ExecutionInfo);
    static get msgTypeId() { return 5; }

    static unapply(inst: ExecutionInfo): ConstructorParameters<typeof ExecutionInfo> {
        return [inst.startTs, inst.endTs];
    }

    constructor(readonly startTs: number, readonly endTs?: number) {
        super(startTs, endTs);

        this.startTs = startTs;
        this.endTs = endTs;

        Object.freeze(this);
    }
}

Result.codecs = [
  Output,           // 0
  CompileErrors,    // 1
  RuntimeError,     // 2
  ClearResults,     // 3
  ResultValue,      // 4
  ExecutionInfo,    // 5
];

Result.codec = discriminated(
    uint8,
    (msgTypeId) => Result.codecs[msgTypeId].codec,
    (result) => (result.constructor as typeof Result).msgTypeId
);


