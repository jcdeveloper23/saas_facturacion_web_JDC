declare interface HelpQuestion {
    helpQuestionId?: string;
    helpQuestionCode?: string;
    helpQuestionTitle?: string;
    helpQuestionDescription?: string;
    helpQuestionAnswer?: string;
    helpQuestionCategoryId?: string;
    helpQuestionCategoryName?: string;
    helpQuestionTargetUserType?: string; // 'client' | 'driver' | 'both'
    helpQuestionOrder?: number;
    helpQuestionState?: boolean;
    helpQuestionViews?: number;
    helpQuestionIsPopular?: boolean;
    helpQuestionTags?: string[];
    helpQuestionDateRegister?: string;
    helpQuestionTimeRegister?: string;
    helpQuestionDateUpdate?: string;
    helpQuestionTimeUpdate?: string; 
}
