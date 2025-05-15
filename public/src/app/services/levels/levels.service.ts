import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Levels } from 'app/interfaces/levels';

@Injectable({
  providedIn: 'root'
})
export class LevelsService {

  constructor(private db: AngularFirestore) { }

  public getLevelsBySchool(level_id : string) {
    return this.db.collection('levels', ref => ref.where('level_id_school' , '==' , level_id )).valueChanges()
  }

  public getLevelsAll() {
    return this.db.collection('levels').valueChanges()

  }

  public getNameLevelById( level_id : string){
    return this.db.collection<Levels>('levels', ref => ref.where('level_id' , '==' , level_id )).valueChanges()
  }
}
