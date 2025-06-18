export interface Student {
    student_id ?: string;
    student_identification ?: string;
    student_name ?: string;
    student_lastname ?: string;
    student_email ?: string;
    student_phone ?: string
    student_gender ?: string
    student_date_of_birth ?: string;
    student_level ?: string;
    student_parallel ?: string;
    student_address ?: string;
    student_id_school ?: string;
    student_id_representative ?: string;
    student_name_representative ?: string;
    student_img ?: string;
    student_password ?: string;
    student_password_confirm ?: string;
    student_state ?: boolean;
    student_date_register ?: string;
    student_state_register ?: boolean;
    student_email_is_valid ?: boolean;
    student_allergies ?: Array<string>;
}


