import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class ParallelsService {

  constructor(private db : AngularFirestore) { }

  public getParallelsBySchool(level_id : string) {
    return this.db.collection('parallels', ref => ref.where('parallel_level_id' , '==' ,level_id )).valueChanges();
  }
}
