import Layout from '../components/layout'
import path from 'path'
import { promises as fs } from 'fs'

function Timetable({trips}) {

  const inbound = trips.inbound;

  return (
    <Layout>
      <table>
        {inbound.map((item) => (
          <tr>
            {Object.entries(item.times).map(([key, value]) => (
              <td>{value}</td>
            ))}
          </tr>
        ))}
      </table>
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
