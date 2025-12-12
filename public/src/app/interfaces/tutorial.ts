export interface Quiz {
    question: string;
    options: string[];
    correctAnswerIndex: number;
}

export interface TutorialSubSection {
    id: string;
    title: string;
    content?: string; // HTML content
}

export interface TutorialSection {
    id?: string; // Firestore ID
    title: string;
    icon: string;
    locked: boolean;
    completed?: boolean; // Client-side state, maybe not needed in DB or default to false
    quiz?: Quiz;
    subsections?: TutorialSubSection[];
    order: number;
    active: boolean; // To hide sections without deleting them
}
