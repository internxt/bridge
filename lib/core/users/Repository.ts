export interface UsersRepository {
  findById(id: string): any;
  findOne(where: any): any;
  create(data: any): any;
  updateById(id: string, update: any): any;
  remove(where: any): any;
}
