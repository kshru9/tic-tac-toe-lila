// TypeScript declarations for Nakama runtime
// These types are provided by the Nakama runtime environment

declare namespace nkruntime {
    interface Context {
        userId: string;
        username: string;
        sessionId: string;
        matchId: string;
        matchLabel?: string;
        matchTick?: number;
    }

    interface Logger {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
        debug(message: string): void;
    }

    interface Nakama {
        // Add minimal required methods
        matchCreate(matchHandler: string, params: Record<string, any>): string;
        matchList(limit: number, authoritative?: boolean, label?: string, minSize?: number, maxSize?: number, query?: string): MatchList;
        matchLabelUpdate(matchId: string, label: string): void;
        matchSendData(matchId: string, opCode: number, data: string, presences?: Presence[] | null, sender?: Presence | null, reliable?: boolean): void;
        storageRead(objects: any[]): any[];
        storageWrite(objects: any[]): void;
        storageList(userId: string, collection: string, key: string, limit: number, cursor?: string): { objects: any[]; cursor?: string };
    }

    interface MatchList {
        matches: MatchList.Match[];
    }

    namespace MatchList {
        interface Match {
            matchId: string;
            authoritative: boolean;
            label?: string;
            size: number;
            tickRate: number;
            handlerName: string;
        }
    }

    interface Presence {
        userId: string;
        sessionId: string;
        username: string;
        node: string;
        metadata?: Record<string, any>;
    }

    interface Initializer {
        registerRpc(id: string, fn: (ctx: Context, logger: Logger, nk: Nakama, payload: string) => string): void;
        registerMatch(name: string, handler: MatchHandler): void;
    }

    interface MatchHandler {
        matchInit?: (ctx: Context, logger: Logger, nk: Nakama, params: Record<string, string>) => { state: any };
        matchJoinAttempt?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, presence: Presence, metadata: Record<string, any>) => { state: any; accept: boolean; rejectMessage?: string };
        matchJoin?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, presences: Presence[]) => { state: any };
        matchLeave?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, presences: Presence[]) => { state: any };
        matchLoop?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, messages: MatchMessage[]) => { state: any };
        matchTerminate?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, graceSeconds: number) => { state: any };
        matchSignal?: (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: any, data: string) => { state: any; data?: string };
    }

    interface MatchDispatcher {
        broadcastMessage(opCode: number, data: string, presences?: Presence[]): void;
    }

    interface MatchMessage {
        sender: Presence;
        opCode: number;
        data: string;
    }

    type InitModule = (ctx: Context, logger: Logger, nk: Nakama, initializer: Initializer) => void;
}