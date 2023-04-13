import axios from 'axios'

export const linkpool = axios.create({
  baseURL: `${process.env.MERKLE_API_URL}/v1`,
  headers: {
    'x-access-key-id': process.env.MERKLE_API_ACCESS_KEY_ID,
    'x-secret-key': process.env.MERKLE_API_SECRET_KEY,
  },
})
