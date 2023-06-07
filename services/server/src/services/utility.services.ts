import { MongoClient } from 'mongodb'

export async function get_ssid_profile_ids(client: Promise<MongoClient>, data: any) {
     // test to see if manual reference works 
    const col = (await client).db('gui').collection('ssid_profiles');
    var arr = [];
    arr.length += data.ssid_profiles.length;
        for (let i = 0; i < data.ssid_profiles.length; i++) {
            arr[i] = (await col.findOne({"name":`${data.ssid_profiles[i]}`}))?._id
        }
    return arr;
}

export async function get_schedule_ids(client: Promise<MongoClient>, data: any) {
    // test to see if manual reference works 
   const col = (await client).db('gui').collection('schedules');
   var arr = [];
   arr.length += data.schedules.length;
       for (let i = 0; i < data.schedules.length; i++) {
           arr[i] = (await col.findOne({"name":`${data.schedules[i]}`}))?._id
       }
   return arr;
}

export async function get_job_ids(client: Promise<MongoClient>, data: any) {
    // test to see if manual reference works 
   const col = (await client).db('gui').collection('jobs');
   var arr = [];
   arr.length += data.jobs.length;
       for (let i = 0; i < data.jobs.length; i++) {
           arr[i] = (await col.findOne({"name":`${data.jobs[i]}`}))?._ids
       }
   return arr;
}

export async function get_archiver_ids(client: Promise<MongoClient>, data: any) {
    // test to see if manual reference works s
   const col = (await client).db('gui').collection('archivers');
   var arr = [];
   arr.length += data.archivers.length;
       for (let i = 0; i < data.archivers.length; i++) {
           arr[i] = (await col.findOne({"name":`${data.archivers[i]}`}))?._id
       }
   return arr;
}

export async function get_test_ids(client: Promise<MongoClient>, data: any) {
    // test to see if manual reference works 
   const col = (await client).db('gui').collection('tests');
   var arr = [];
   arr.length += data.tests.length;
       for (let i = 0; i < data.tests.length; i++) {
           arr[i] = (await col.findOne({"name":`${data.tests[i]}`}))?._id
       }
   return arr;
}


