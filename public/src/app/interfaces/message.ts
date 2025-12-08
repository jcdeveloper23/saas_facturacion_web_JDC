export interface Message {
    message_id: string;
    message_name: string;
    message_email: string;
    message_phone: string;
    message_city: string;
    message_content: string;
    message_timestamp: any; // Firebase Timestamp
    message_read: boolean;
    message_replied: boolean;
}
