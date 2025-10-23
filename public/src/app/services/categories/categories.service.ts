import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class CategoriesService {

  constructor(
    private db: AngularFirestore
  ) { }

  public getCategories() {
    return this.db.collection<Categories>('categories').valueChanges();
  }
  public getCategoriesMain(categoriesIsMain) {
    return this.db.collection<Categories>('categories', ref => ref.where('categoriesIsMain', '==', categoriesIsMain)).valueChanges();
  }

  public getCategoriesByType(categoriesType: string) {
    return this.db.collection<Categories>('categories', ref => ref.where('categoriesType', '==', categoriesType)).valueChanges();
  }

  public getCategoriesByID(id: string) {
    return this.db.collection<Categories>('categories', ref => ref.where('categoriesId', '==', id)).valueChanges()
  } 

   public selectCategoryByParent(id: string): Promise<Categories[]> {
    return this.db.collection<Categories>('categories', ref => ref.where('categoriesParent', '==', id)).get().toPromise().then(snapshot => snapshot.docs.map(doc => doc.data() as Categories));
  }

  saveCategories(categories: Categories) {
    return this.db.collection('categories').doc(categories.categoriesId).set(categories);
  }

  editCategories(categories: Categories) {
    return this.db.collection('categories').doc(categories.categoriesId).update(categories);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteCategories(categoriesId: string) {
    return this.db.collection('categories').doc(categoriesId).delete();
  }

  public saveProvinces(id, data) {
    return this.db.collection('statesOfVenezuela').doc(id.toString()).set(data);
  }

  public getProvinces() {
    return this.db.collection('statesOfVenezuela').valueChanges();
  }

}
