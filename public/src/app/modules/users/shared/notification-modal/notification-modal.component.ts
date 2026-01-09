import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-notification-modal',
    templateUrl: './notification-modal.component.html',
    styleUrls: ['./notification-modal.component.css']
})
export class NotificationModalComponent implements OnInit {

    @Input() isOpen: boolean = false;
    @Input() title: string = '';
    @Input() body: string = '';
    @Input() userName: string = '';
    @Input() role: string = ''; // 'Cliente' or 'Conductor'
    @Input() actionType: string = ''; // 'verificada', 'desverificada', or 'custom'
    @Input() isCustom: boolean = false;
    @Input() templates: { title: string, body: string, label: string }[] = [];

    @Output() onClose = new EventEmitter<void>();
    @Output() onConfirm = new EventEmitter<{ title: string, body: string }>();

    public editedBody: string = '';
    public editedTitle: string = '';

    constructor() { }

    ngOnInit(): void {
    }

    ngOnChanges(): void {
        if (this.isOpen) {
            this.editedTitle = this.title;
            this.editedBody = this.body;
        }
    }

    public close(): void {
        this.onClose.emit();
    }

    public confirm(): void {
        this.onConfirm.emit({
            title: this.editedTitle,
            body: this.editedBody
        });
    }

    public selectTemplate(template: { title: string, body: string }): void {
        this.editedTitle = template.title;
        this.editedBody = template.body;
    }

    public getFirstName(): string {
        if (!this.userName) return 'Usuario';
        return this.userName.split(' ')[0];
    }
}
