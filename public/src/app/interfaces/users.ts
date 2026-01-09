// Historial de cambios de comisión
export interface CommissionHistory {
    date: string;
    time: string;
    previousRate: number;
    newRate: number;
    updatedBy: string;
    reason?: string;
}

export interface Users {
    // Backend Model Fields (Sequelize)
    id?: number;
    userPhone?: string;
    userPhoneEmergency?: string;
    userPassword?: string;
    userFullName?: string;
    userLastName?: string;
    userEmail?: string;
    userEmailEmergency?: string;
    userCity?: number; // References City ID (integer)
    userImageProfile?: number;
    userReceiveNotifications?: boolean;
    userMuteNotifications?: boolean;
    userUuid?: string;
    userCurrentRole?: number;
    userSettingId?: number;
    state?: boolean;

    // Field removed as it was legacy
}
