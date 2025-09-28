import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class InstructionsService {
  
    constructor(
      private db: AngularFirestore
    ) { }
  
    public getInstructions() {
      return this.db.collection<Instructions>('instructions').valueChanges();
    }
  
    public getInstructionsByID(id: string) {
      return this.db.collection<Instructions>('instructions', ref => ref.where('instructionsId', '==', id)).valueChanges()
    }
  
    saveInstructions(instructions: Instructions) {
      return this.db.collection('instructions').doc(instructions.instructionsId).set(instructions);
    }
  
    editInstructions(instructions: Instructions) {
      return this.db.collection('instructions').doc(instructions.instructionsId).update(instructions);
    }
  
    /**
    * *** Delete company ***
    * @param userId
    * @returns 
    */
    public deleteInstructions(instructionsId: string) {
      return this.db.collection('instructions').doc(instructionsId).delete();
    }
  
    public saveProvinces(id, data) {
      return this.db.collection('statesOfVenezuela').doc(id.toString()).set(data);
    }
  
    public getProvinces () {
      return this.db.collection('statesOfVenezuela').valueChanges();
    }
  
}
