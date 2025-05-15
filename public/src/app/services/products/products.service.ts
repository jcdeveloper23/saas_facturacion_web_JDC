import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Product } from 'app/interfaces/product';

@Injectable({
  providedIn: 'root'
})
export class ProductsService {
  private last: any;
  private next: any;
  private nextToTalPost: any;
  private nextProductAll: Array<any> = []
  constructor(private db: AngularFirestore) { }

  /**
   * Metodo para registar un nuevo producto en bd.
   * @param product 
   * @returns 
   */
  public saveProduct(provider_id: string, product: Product) {
    return this.db.collection('products').doc(`${product.product_id}`).set(product);
  }

  /**
   * Metodo para actualizar un producto existente.
   * @param product 
   * @returns 
   */
  public updateProduct(provider_id: string, product: Product) {
    return this.db.collection('products').doc(`${product.product_id}`).update(product);
  }

  /**
   * Metodo para consultar unicamente los productos de un proveedor logueado.
   * @param provider_id 
   * @returns 
   */
  public getProductsByProvider(provider_id?: string) {
    return this.db.collection('products', ref => ref.where('product_provider_id', '==', provider_id)).valueChanges()
  }

  public deleteProduct(provider_id?: string, product_id?: string) {
    return this.db.collection('products').doc(`${product_id}`).delete()
  }

  public getProductById(provider_id?: string, product_id?: string) {
    return this.db.collection('products').doc(`${product_id}`).valueChanges()
  }

  public getProductsByCategoryIdActive(category_id: string) {
    return this.db.collection('products', ref => ref.where('product_id_category', '==', category_id).where('product_state', '==', true)).valueChanges()
  }

  public getProductsByCategoryIdActiveAndProviderId(category_id: string, provider_id: string) {
    let first = this.db.collection<Product>('products', (ref) => ref.where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
      .orderBy("product_id", "desc")
      .limit(6)
    );
    first.get().subscribe(documentSnapshots => {
      // Get the last visible document
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        // Construct a new query starting at this document,
        // get the next 25 cities.
        this.next = this.db.collection("products", ref => ref.where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));
      }

    });
    return first.valueChanges()

    // return this.db.collection('products' , ref => ref.where('product_id_category' , '==' , category_id ).where('product_state', '==' , true).where('product_provider_id', '==' , provider_id)).valueChanges()
  }

  public getMoreSix(category_id: string, provider_id: string) {
    this.next.get().subscribe(documentSnapshots => {
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        this.next = this.db.collection("products", ref => ref
          .where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));
      }

    });
    return this.next.valueChanges()
  }

  public getMoreTotalProducts(provider_id: string) {
    this.nextToTalPost.get().subscribe(documentSnapshots => {
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        this.nextToTalPost = this.db.collection("products", ref => ref.where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));
      }

    });
    return this.nextToTalPost.valueChanges()
  }



  public getProductsAllActives(provider_id: string) {
    let first = this.db.collection<Product>('products', (ref) => ref.where('product_state', '==', true).where('product_provider_id', '==', provider_id)
      .orderBy("product_id", "desc")
      .limit(6)
    );
    first.get().subscribe(documentSnapshots => {
      // Get the last visible document
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        // Construct a new query starting at this document,
        // get the next 25 cities.
        this.nextToTalPost = this.db.collection("products", ref => ref.where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));
      }

    });
    return first.valueChanges()



    // return this.db.collection('products' , ref => ref.where('product_state', '==' , true).where('product_provider_id', '==' , provider_id)).valueChanges()
  }

  public getAllProductsOfCategory(category_id: string, provider_id: string) {
    return this.db.collection('products', ref => ref.where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)).valueChanges()

  }

  public getProductsAllBydActive(provider_id: string) {
    return this.db.collection('products', ref => ref.where('product_provider_id', '==', provider_id).where('product_state', '==', true)).valueChanges()
  }



  public getProductsByCategoryIdActiveAndProviderIdselectCategoryAll(category_id: string, provider_id: string, i: number) {
    let first = this.db.collection<Product>('products', (ref) => ref.where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
      .orderBy("product_id", "desc")
      .limit(6)
    );
    first.get().subscribe(documentSnapshots => {
      // Get the last visible document
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        // Construct a new query starting at this document,
        // get the next 25 cities.
        this.nextProductAll[i] = this.db.collection("products", ref => ref.where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));

      }

    });
    return first.valueChanges()

    // return this.db.collection('products' , ref => ref.where('product_id_category' , '==' , category_id ).where('product_state', '==' , true).where('product_provider_id', '==' , provider_id)).valueChanges()
  }

  public getMoreSixCategoryAll(category_id: string, provider_id: string, i: number) {
    this.nextProductAll[i].get().subscribe(documentSnapshots => {
      if (documentSnapshots.docs.length > 0) {
        var lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        this.nextProductAll[i] = this.db.collection("products", ref => ref
          .where('product_id_category', '==', category_id).where('product_state', '==', true).where('product_provider_id', '==', provider_id)
          .orderBy("product_id", "desc")
          .startAfter(lastVisible)
          .limit(6));
      }

    });
    return this.nextProductAll[i].valueChanges()
  }

  public getProductsByCategoryMenu(provider_id : string, category_id: string) {
    return this.db.collection('products', ref => ref.where('product_provider_id', '==', provider_id).where('product_state', '==', true).where('product_id_category' , '==' , category_id)).valueChanges()
  }

}
