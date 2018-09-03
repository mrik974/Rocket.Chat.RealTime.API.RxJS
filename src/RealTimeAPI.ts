/**
 * Rocket.Chat RealTime API
 */

import { Observable } from "rxjs";
import { WebSocketSubject } from 'rxjs/WebSocket';
import { v1 as uuid } from "uuid";
import { sha256 } from 'js-sha256';
import { merge, of } from 'rxjs';

export class RealTimeAPI {
    public url: string;
    public webSocket: WebSocketSubject<{}>;

    constructor(param: string | WebSocketSubject<{}>) {
        switch (typeof param) {
            case "string":
                this.url = param as string;
                this.webSocket = new WebSocketSubject(this.url);
                break;
            case "object":
                this.webSocket = param as WebSocketSubject<{}>;
                this.url = this.webSocket.url;
                break;
            default:
                throw new Error(`Invalid Parameter to the Constructor, Parameter must be of Type WebSocketSubject or URL but was found of type "${typeof param}"`);
        }
    }

    /**
     * Returns the Observable to the RealTime API Socket
     */
    public getObservable() {
        return this.webSocket.catchError((err: any) => of(err));
    }

    /**
     * Disconnect the WebSocket Connection between client and RealTime API
     */
    public disconnect() {
        return this.webSocket.unsubscribe();
    }

    /**
     * onMessage
     */
    public onMessage(messageHandler?: ((value: {}) => void) | undefined): void {
        this.subscribe(messageHandler, undefined, undefined);
    }


    /**
     * onError
     */
    public onError(errorHandler?: ((error: any) => void) | undefined): void {
        this.subscribe(undefined, errorHandler, undefined);
    }

    /**
     * onCompletion
     */
    public onCompletion(completionHandler?: (() => void) | undefined): void {
        this.subscribe(undefined, undefined, completionHandler);
    }

    /**
     * Subscribe to the WebSocket of the RealTime API
     */
    public subscribe(messageHandler?: ((value: {}) => void) | undefined, errorHandler?: ((error: any) => void) | undefined, completionHandler?: (() => void) | undefined) {
        this.getObservable().subscribe(messageHandler, errorHandler, completionHandler);
    }

    /**
     * sendMessage to Rocket.Chat Server
     */
    public sendMessage(messageObject: {}): void {
        this.webSocket.next(messageObject);
    }

    /**
     * getObservableFilteredByMessageType
     */
    public getObservableFilteredByMessageType(messageType: string) {
        return this.getObservable().filter((message: any) => message.msg === messageType);
    }

    /**
     * getObservableFilteredByID
     */
    public getObservableFilteredByID(id: string) {
        return this.getObservable().filter((message: any) => message.id === id);
    }

    /**
     * connectToServer
     */
    public connectToServer() {
        this.sendMessage({ "msg": "connect", "version": "1", "support": ["1", "pre2", "pre1"] });
        return this.getObservableFilteredByMessageType("connected");
    }

    /**
     * keepAlive, Ping and Pong to the Rocket.Chat Server to Keep the Connection Alive.
     */
    public keepAlive(): void {
        this.getObservableFilteredByMessageType("ping").subscribe(
            this.sendMessage({ msg: "pong" })
        );
    }

    /**
     * Login with Username and Password
     */
    public login(username: string, password: string) {
        let id = uuid();
        let usernameType = username.indexOf("@") !== -1 ? "email" : "username";
        this.sendMessage({
            "msg": "method",
            "method": "login",
            "id": id,
            "params": [
                {
                    "user": { [usernameType]: username },
                    "password": {
                        "digest": sha256(password),
                        "algorithm": "sha-256"
                    }
                }
            ]
        });
        return this.getLoginObservable(id);
    }

    /**
     * Login with Authentication Token
     */
    public loginWithAuthToken(authToken: string) {
        let id = uuid();
        this.sendMessage({
            "msg": "method",
            "method": "login",
            "id": id,
            "params": [
                { "resume": authToken }
            ]
        });
        return this.getLoginObservable(id);
    }

    /**
     * Login with OAuth, with Client Token and Client Secret
     */
    public loginWithOAuth(credToken: string, credSecret: string) {
        let id = uuid();
        this.sendMessage({
            "msg": "method",
            "method": "login",
            "id": id,
            "params": [
                {
                    "oauth": {
                        "credentialToken": credToken,
                        "credentialSecret": credSecret
                    }
                }
            ]
        });
        return this.getLoginObservable(id);
    }

    /**
     * getLoginObservable
     */
    public getLoginObservable(id: string) {
        let resultObservable = this.getObservableFilteredByID(id);
        let resultId: string;
        resultObservable.subscribe(
            (message: any) => {
                if ((message.id === id && message.msg === "result" && !message.error))
                    resultId = message.result.id;
            }
        );

        let addedObservable = this.getObservable().buffer(resultObservable).find((obj : any) => obj.find((msg : any) => msg.id === resultId && resultId !== undefined) !== undefined).map((obj : any) => obj[0]);
        return merge(resultObservable, addedObservable);
    }

    /**
     * Get Observalble to the Result of Method Call from Rocket.Chat Realtime API
     */
    public callMethod(method: string, ...params: Array<{}>) {
        let id = uuid();
        this.sendMessage({
            "msg": "method",
            method,
            id,
            params
        });
        return this.getObservableFilteredByID(id);
    }

    /**
     * getSubscription
     */
    public getSubscription(streamName: string, streamParam: string, addEvent: boolean) {
        const id = uuid();
        const subMsg: any = {
            "msg": "sub",
            "id": id,
            "name": streamName,
            "params": [
                streamParam,
                addEvent
            ]
        };
        const unsubMsg: any = {
            "msg": "unsub",
            "id": id
        };
        let subscription = this.webSocket.multiplex(
            () => subMsg,
            () => unsubMsg,
            (message: any) => typeof message.collection === "string" && message.collection === streamName && message.fields.eventName === streamParam // Proper Filtering to be done. This is temporary filter just for the stream-room-messages subscription
        );
        return subscription;
    }
}
