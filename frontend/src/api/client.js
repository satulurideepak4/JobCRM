import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:4445',
  timeout: 30000,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('API error:', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

export default api
