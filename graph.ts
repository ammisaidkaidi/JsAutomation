module graph {
    //const $error = "$error";
    //const $else = "$else";
    declare type fn<T> = (status: statusType<T>, e: IGraphArgs<T>) => boolean;
    declare type nodeRunner<T> = (e: IGraphArgs<T>) => T | Promise<T>;
    declare type nodeName = number | string | typeof OUTPUT | typeof INPUT;
    declare type nodeResult<T> = T | Promise<T>;
    declare type VectorValue<T> = T | typeof ERROR | typeof ELSE | fn<T>;
    declare type eventCallback<T> = (name: string, e: IGraphArgs<T>, args: any) => void;
    declare type statusType<T> = T | GraphError | typeof UNKNOWN;
    declare type inputType<T> = T | Error | typeof UNKNOWN;

    interface IGraphArgs<T> {
        previous: IGraphArgs<T>,
        graph: graph<T>;
        prevNode: node<T>;
        curNode: node<T>;
        input: inputType<T>;
        status?: statusType<T>;
        result?: any;
    }
    class GraphError extends Error {
        constructor(message: any) {
            super(message);
        }
    }
    export const UNKNOWN = new (class UNKNOWN { });
    export const ELSE = new (class ELSE { });
    export const ERROR = new (class ERROR { });
    export const OUTPUT = new (class OUTPUT { });
    export const INPUT = new (class INPUT { });
    class graph<T> {
        private static $output: node<any>;
        private static onFinish(e: IGraphArgs<any>) {
            try {
                e.graph.end(e.result);
            } finally {
                e.graph._wait = false
            };
        }
        private _nodes = new Map<nodeName, node<T>>();
        private _wait: boolean = false;
        private _cur: IGraphArgs<T>;
        public get Input() { return this._nodes.get(INPUT); }
        public get Output() { return this._nodes.get(OUTPUT) || graph.$output || (graph.$output = new node<any>(OUTPUT, graph.onFinish)); }

        public add(...nodes: node<T>[]) { for (var node of nodes) this._nodes.set(node.name, node); }
        public addNode(name: nodeName, fn: nodeRunner<T>) {
            this._nodes.set(name, new node(name, fn));
            return this;
        }
        public addNodes(...prms: [nodeName, nodeRunner<T>, [T | fn<T>, nodeName][]?][]) {
            for (const prm of prms) {
                const n = new node(prm[0], prm[1]);
                if (prm[2]) n.setVectors.apply(n, prm[2]);
                this._nodes.set(prm[0], n);
            }
            return this;
        }
        public addVectors(node: nodeName, ...vectors: [T | fn<T>, nodeName][]) {
            const n = this._nodes.get(node);
            n.setVectors.apply(n, vectors);
            return this;
        }
        start(input: T) {
            if (this._wait) throw "the graph is under execution";
            this._wait = true;
            let curNode = this._nodes.get(INPUT);
            this.execute(this._cur = {
                previous: void 0,
                graph: this, curNode: curNode, prevNode: void 0, input
            });
            return this;
        }
        private _es: IGraphArgs<T>[];
        private continue(args: IGraphArgs<T>): this {
            if (!this._wait) throw "graph is not running";
            if (this._es) return this._es.unshift(args), this;
            else this._es = [args];
            this.fire('executed', args);
            while (this._es.length) {
                const e = this._es.pop();
                if (e !== this._cur) throw "invalide stat detected";
                this._cur = {
                    graph: this,
                    previous: this._cur,
                    input: this._cur.status,
                    curNode: this.getNextNode(e),
                    prevNode: this._cur.curNode
                }
                if (this._cur.curNode)
                    this.execute(this._cur);
                else {
                    this._cur.status = UNKNOWN;
                    this.fire('unknown', this._cur);
                    this.end(void 0);
                }
            }
            this._es = void 0;
            return this;
        }
        end(data: any) {
            this._wait = false;
            this.fire('end', this._cur, data);
        }
        private execute(e: IGraphArgs<T>) {
            try {
                let p = e.curNode.fn(e);
                if (p instanceof Promise) {
                    this.fire('defrered', e);
                    p.then(v => {
                        e.status = v;
                        this.continue(e);
                    }).catch(v => {
                        e.status = v instanceof GraphError ? v : new GraphError(v);
                        this.continue(e);
                    });
                } else {
                    e.status = p;
                    this.continue(e);
                }
            } catch (err) {
                e.status = err instanceof GraphError ? err : new GraphError(err);
                this.fire('error', e, err);
                this.continue(e);
            }
        }
        private getNextNode(e: IGraphArgs<T>): node<T> {
            let node: node<T> = e.curNode, status: statusType<T> = e.status;
            const isError = status instanceof GraphError;
            let name: nodeName = isError ? node.vectors.get(ERROR) : node.vectors.get(status as T);
            !name && !isError && node.vectors.forEach((v, k) => {
                if (typeof k !== "function" || !(k as fn<T>)(status, e)) return true;
                return name = v, false;
            });
            name = name || node.vectors.get(ELSE);
            return name && (this._nodes.get(name) || (name == "$output" ? graph.$output : void 0));
        }
        private _events: { [event: string]: eventCallback<T>[] } = {};
        public on(event: string, call: eventCallback<T>) {
            if (typeof call !== 'function') throw "unvalide function";
            let ev = this._events[event];
            if (!ev) this._events[event] = ev = [call];
            else ev.push(call);
            return this;
        }
        public off(event: string, call: eventCallback<T>) {
            let ev = this._events[event];
            const i = ev && ev.indexOf(call);
            (ev && i > -1) && ev.splice(i, 1);
            return this;
        }
        private fire(event: string, e: IGraphArgs<T>, args?: any) {
            let ev = this._events[event];
            if (ev) for (const v of ev)
                try {
                    v(event, e, args);
                } catch  {

                }
            return this;
        }
    }
    class node<T> {
        vectors = new Map<typeof ERROR | typeof ELSE | T | fn<T>, nodeName>();
        setVector(cnd: T | fn<T>, nodeName: nodeName) {
            this.vectors.set(cnd, nodeName);
            return this;
        }
        setVectors(...vectors: [T | fn<T>, nodeName][]) {
            for (var v of vectors)
                this.vectors.set(v[0], nodeName2Node(v[1]));
            return this;
        }

        else(node: nodeName) {
            this.vectors.set(ELSE, node);
            return this;
        }
        error(node: nodeName) {
            this.vectors.set(ERROR, node);
            return this;
        }
        constructor(public name: nodeName, public fn: nodeRunner<T>) {
            name = nodeName2Node(name)
            if (!name) throw "the name " + name + "  is invalide";
        }
    }
    const specNodeNameKeywords = new Map<string, typeof INPUT | typeof OUTPUT>([["$input", INPUT], ["$output", OUTPUT]]);
    const specConstKeywords = new Map<string, typeof ELSE | typeof ERROR>([["$else", ELSE], ["$error", ERROR]]);

    function nodeName2Node(n: nodeName): nodeName {
        return typeof n !== "string" ? n : specNodeNameKeywords.get(n = n.toLowerCase()) || n;
    }
    function name2ConstName<T>(n: any): typeof ERROR | typeof ELSE | T {
        return typeof n !== "string" ? n : specConstKeywords.get(n = n.toLowerCase()) || n;
    }
    function test() {
        let p = new graph<any>();
        var i = 0;
        let x = () => (i += Math.floor(Math.random() * Date.now())) % 3;
        function getUrl(e: IGraphArgs<any>) {
            console.log("getURL");
            return [0, 200, 401][x()];
        }
        function lost(e: IGraphArgs<any>) {
            console.log("lost");
            return new Promise((res, rej) => {
                window["curPrm"] = window['lost'] = { rs: res, rj: rej };
            });
        }
        function auth(e: IGraphArgs<any>) {
            console.log("auth");
            return new Promise((res, rej) => {
                window["curPrm"] = window['auth'] = { rs: res, rj: rej };
            });
        }
        p.addNodes(
            [INPUT, getUrl, [[0, "lost"], [ELSE, INPUT], [401, "auth"]]],
            ["lost", lost, [[0, "lost"], [ELSE, INPUT], [401, "auth"]]],
            ["auth", auth, [[401, "auth"], [200, INPUT], [0, "lost"], [ELSE, INPUT], [ERROR, "auth"]]]
        );
        p.start("tootl");
        p.on('finish', (n, e, a) => {

        });
        return p;
    }
    window["p"] = test();
}