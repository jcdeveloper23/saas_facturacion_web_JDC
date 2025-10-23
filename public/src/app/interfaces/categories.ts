declare interface Categories {
    subCategories?: Array<Categories>;
    categories?:Categories;
    categoriesId?: string,
    categoriesCode?: string,
    categoriesName?: string,
    categoriesDescription?: string,
    categoriesState?: boolean,
    categoriesIsMain?: boolean,
    categoriesIsPremium?: boolean,
    categoriesIsCar?: boolean,
    categoriesAllowsMultipleSelection?: boolean,
    categoriesParent?: string,
    categoriesParentName?: string,
    categoriesDateRegister?: string,
    categoriesTimeRegister?: string,
    categoriesIcon?: string,
    categoriesPrice?: string,
    categoriesType?: string,
    categoriesNumberOfPassengers?: number,
    categoriesNumberOfLuggage?: number,
}