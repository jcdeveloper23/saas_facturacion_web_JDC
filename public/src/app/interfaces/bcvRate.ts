declare interface BcvRate {
    current?:          Current;
    previous?:         Current;
    changePercentage?: ChangePercentage;
    updates?: number;
}

declare interface ChangePercentage {
    usd?: number;
    eur?: number;
}

declare interface Current {
    usd?:  number;
    eur?:  number;
    date?: string;
}
