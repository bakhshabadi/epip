import { Inject, Injectable } from '@nestjs/common';
import { Connection, Repository } from 'typeorm';
import { Customer } from '../models/crm/customer.model';
import { DB_Providers } from 'src/@database/enums/db.enum';
import { Person } from '../models/moz/model.model';
import * as Axios from "axios";
import to from 'await-to-js';
import { IResponse } from '@lib/epip-crud';
import { CustomerService } from './customer.service';

@Injectable()
export class PersonService{
  constructor(
    @Inject('PERSON_REPOSITORY')
    private repo:Repository<any>,

    @Inject('CUSTOMER_REPOSITORY')
    private customerRepo:Repository<Customer>,

    private readonly crmService: CustomerService
  ){
  }

  public fetchPerson():Promise<Array<Person>>{
    return this.repo.query(`
      select au.id, bp.seller_id seller_id,au.phone phone,au.name,count(*) count from bon_property bp
      inner join auther_user au on au.id = bp.seller_id
      inner join auther_user_roles ar on ar.user_id = bp.seller_id
      where
        ar.role_id not in (4,6)
        and now() <= (bp.inserted_at + 90 * INTERVAL '1 day')
        and bp.seller_id not in (
            SELECT seller_id FROM dblink('dbname=db1','select seller_id from db1.public.customer') as t1(seller_id integer)
          )
      group by bp.seller_id,au.phone,au.name
      order by count(*) desc
    `) as Promise<Array<Person>>
  }

  public async addPerson(entity:Customer):Promise<any>{
    
    let res= await this.repo.query(`
      select bp.* from bon_person bp
      inner join auther_user aur on bp.user_ptr_id=aur.id
      where aur.phone = $1
    `,[entity.phone]);

    if(res.length){
      return new Promise((_,rej)=>{
        return rej('نام کاربری شما وجود دارد')
      });
    }

    res= await this.repo.query(`
      insert into auther_user (
        deleted_at,
        inserted_at,
        updated_at,
        name,
        username,
        email,
        phone,
        password,
        active,
        expire,
        domain_id,
        parent_id
      )values(
        null,
        now(),
        now(),
        $1,
        $2,
        null,
        $3,
        '',
        true,
        null,
        null,
        null
      )
    `,[
        entity.name,
        entity.phone,
        entity.phone,
      ]);

      if(!res){
        return new Promise((_,rej)=>{
          return rej('خطا در ثبت مشتری')
        });
      }
    
      if(res){
        res= await this.repo.query(`SELECT last_value from auther_user_id_seq`);
        if(!res){
          return new Promise((_,rej)=>{
            return rej('خطا در ثبت مشتری و دریافت کد')
          });
        }
        let res1=await this.repo.query(`
        insert into bon_person(
          user_ptr_id,
          manager_name,
          latitude,
          longitude,
          legal_entity,
          natural_person,
          vip,
          counter_view,
          date_counter_view
        )values(
          ${res[0].last_value},
          $1,
          null,
          null,
          false,
          false,
          false,
          0,
          null
        )`,[entity.agency])

        if(!res1){
          return new Promise((_,rej)=>{
            return rej('خطا در ثبت نهایی مشتری')
          });
        }

        res1=await this.repo.query(`
          insert into auther_user_roles(user_id,role_id)values(
            ${res[0].last_value},${entity.post.id==1?4:6}
          )
        `);

        if(!res1){
          return new Promise((_,rej)=>{
            return rej('خطا در ثبت نقش مشتری')
          });
        }
        
        return new Promise((resolve,_)=>{
          resolve(res[0].last_value);
        });

      }
  }
  

  public async moveToCrm(id: number):Promise<IResponse<Customer>>{
    let [err,data] = await to(this.customerRepo.find({
      relations:['events','post'],
      where:{
        moz_id: id
      }
    }));

    if(err){
      return {
        status:500,
        message: err.message,
        result: null
      }
    }

    if(data.length){
      return {
        status:201,
        message: "کاربر مورد نظر در سیستم یافت گردید",
        result: data[0]
      }
    }

    let [err2,people] = await to(this.repo.query(`
      select au.id, au.phone phone,au.name from auther_user au
      where
        au.id=$1
    `,[id]));

    if(err2){
      return {
        status:500,
        message: err2.message,
        result: null
      }
    }

    const element = new Customer()
    element.name=people[0].name || "";
    element.seller_id=people[0].seller_id;
    element.agency='';
    element.address='';
    element.phone=people[0].phone;
    element.count_ads=people[0].count;
    element.moz_id=people[0].id;
    
    let res= await this.crmService.post(null,element);

    if(res.status!=201){
      return {
        status:500,
        message:res.message,
        result: null
      }
    }

    return {
      status:201,
      message: "عملیات به درستی صورت گرفت",
      result: res.result
    }

  }
}

export const PersonProviders = [
  {
    provide: 'PERSON_REPOSITORY',
    useFactory: (connection: Connection) => connection.manager,
    inject: [DB_Providers.MOZ_CONNECTION],
  },
];