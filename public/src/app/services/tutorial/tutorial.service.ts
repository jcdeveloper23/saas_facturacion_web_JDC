import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { TutorialSection } from '../../interfaces/tutorial';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class TutorialService {
    private collectionName = 'driverTutorialSections';

    constructor(private db: AngularFirestore) { }

    /**
     * Get all tutorial sections ordered by 'order' field
     */
    getSections() {
        return this.db.collection<TutorialSection>(this.collectionName, ref => ref.orderBy('order'))
            .snapshotChanges()
            .pipe(
                map(actions => actions.map(a => {
                    const data = a.payload.doc.data() as TutorialSection;
                    const id = a.payload.doc.id;
                    return { id, ...data };
                }))
            );
    }

    /**
     * Get active tutorial sections for the driver view
     */
    getActiveSections() {
        return this.db.collection<TutorialSection>(this.collectionName, ref =>
            ref.where('active', '==', true).orderBy('order')
        )
            .snapshotChanges()
            .pipe(
                map(actions => actions.map(a => {
                    const data = a.payload.doc.data() as TutorialSection;
                    const id = a.payload.doc.id;
                    return { id, ...data };
                }))
            );
    }

    getSection(id: string) {
        return this.db.doc<TutorialSection>(`${this.collectionName}/${id}`).valueChanges();
    }

    createSection(section: TutorialSection) {
        // If id is not provided, Firestore auto-generates it
        const id = section.id || this.db.createId();
        const data = { ...section, id };
        return this.db.collection(this.collectionName).doc(id).set(data);
    }

    updateSection(id: string, section: Partial<TutorialSection>) {
        return this.db.collection(this.collectionName).doc(id).update(section);
    }

    deleteSection(id: string) {
        return this.db.collection(this.collectionName).doc(id).delete();
    }

    /**
     * Update the order of multiple sections in batch
     */
    updateSectionsOrder(sections: TutorialSection[]) {
        const batch = this.db.firestore.batch();

        sections.forEach((section) => {
            const ref = this.db.collection(this.collectionName).doc(section.id).ref;
            batch.update(ref, { order: section.order });
        });

        return batch.commit();
    }
}
