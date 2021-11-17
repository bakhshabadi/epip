import { Injectable } from '@nestjs/common';
import { Customer } from '../models/crm/customer.model';
import * as Axios from "axios"

@Injectable()
export class AvanakService{

  public sendVoiceMessage(customer: Customer){
    const options = {
      method: 'POST',
      url: process.env.AVANAK_URL,
      params: {
        UserName: process.env.AVANAK_USERNAME,
        Password: process.env.AVANAK_PASSWORD,
        messageId: process.env.AVANAK_MESSAGEID,
        number: customer.phone,
        vote: process.env.AVANAK_VOTE,
        serverid: process.env.AVANAK_SERVERID
      }
    } as Axios.AxiosRequestConfig;
    console.log(options);

    Axios.default.request(options).then(function (response) {
      console.log(response.data);
    }).catch(function (error) {
      console.error(error);
    })
  }
  
}
