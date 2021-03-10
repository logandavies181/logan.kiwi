import Layout from '../components/layout'
import TimetableComponent from '../components/timetable'

import path from 'path'
import { promises as fs } from 'fs'

function Timetable({trips}) {

  const stopNames = trips.stop_ids_to_names;
  const inbound = trips.inbound;
  const inbound_order = trips.inbound_order;

  return (
    <Layout>
      <TimetableComponent boundInfo={inbound} stopNames={stopNames} order={inbound_order} />
    </Layout>
  )
}

export async function getStaticProps() {

  const fname = path.join(process.cwd(), 'data/6.json');
  const data = await fs.readFile(fname, 'utf-8');
  const trips = JSON.parse(data);

  return {
    props: {
      trips: trips,
    },
  }
}


export default Timetable
