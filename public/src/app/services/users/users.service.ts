import {Injectable} from '@angular/core';
import {AngularFirestore} from '@angular/fire/firestore';
import {Users} from 'app/interfaces/users';

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(private db: AngularFirestore) {
  }

  public saveUser(user: Users) {
    return this.db.collection('users').doc(`${user.user_uid}`).set(user);
  }

  /**
   * Actualiza el estado del usuario para bloquear el acceso
   * */
  public updateUserState(user_uid: string, state: boolean) {
    return this.db.collection('users').doc(user_uid).update({'user_state' : state});
  }

  public getUserByEmail(email: string) {
    return this.db.collection('users', ref => ref.where('user_email', '==', email)).valueChanges();
  }
}
