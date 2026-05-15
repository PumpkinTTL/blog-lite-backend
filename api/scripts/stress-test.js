/**
 * 简单并发压力测试脚本
 * 用法：先启动后端 (pnpm start:dev)，然后 node scripts/stress-test.js
 * 
 * 测试内容：
 * 1. GET /category 并发 50 请求
 * 2. GET /tag 并发 50 请求  
 * 3. GET /post 并发 50 请求
 * 4. GET /user 并发 50 请求
 * 5. GET /announcement 并发 50 请求
 * 6. GET /friend-link 并发 50 请求
 * 7. GET /setting 并发 50 请求
 * 8. GET /media 并发 50 请求
 */

const http = require('http');

const BASE = 'http://localhost:5100';
const CONCURRENCY = 50;

function request(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, time: Date.now() - start, size: data.length });
      });
    }).on('error', reject);
  });
}

async function stressTest(endpoint, concurrency) {
  const url = BASE + endpoint;
  console.log(`\n测试: ${endpoint} (并发 ${concurrency})`);
  
  const start = Date.now();
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(request(url));
  }
  
  const results = await Promise.allSettled(promises);
  const total = Date.now() - start;
  
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');
  const statuses = fulfilled.map(r => r.value.status);
  const times = fulfilled.map(r => r.value.time);
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);
  const min = Math.min(...times);
  const errors = statuses.filter(s => s >= 400).length;
  
  console.log(`  总耗时: ${total}ms`);
  console.log(`  成功: ${fulfilled.length} / 失败: ${failed.length}`);
  console.log(`  响应时间: avg=${avg.toFixed(0)}ms min=${min}ms max=${max}ms`);
  console.log(`  HTTP 错误: ${errors}`);
  
  return { endpoint, total, fulfilled: fulfilled.length, failed: failed.length, avg, max, min, errors };
}

async function main() {
  console.log('=== 博客后端压力测试 ===');
  console.log(`目标: ${BASE}`);
  console.log(`并发: ${CONCURRENCY}`);
  console.log('='.repeat(40));
  
  // 先检查服务是否在运行
  try {
    await request(BASE + '/category');
  } catch (e) {
    console.error('错误: 后端服务未启动，请先运行 pnpm start:dev');
    process.exit(1);
  }
  
  const endpoints = [
    '/category',
    '/tag',
    '/post',
    '/user',
    '/announcement',
    '/friend-link',
    '/setting',
    '/media',
  ];
  
  const results = [];
  for (const ep of endpoints) {
    const result = await stressTest(ep, CONCURRENCY);
    results.push(result);
  }
  
  console.log('\n' + '='.repeat(40));
  console.log('=== 测试报告 ===');
  console.log('='.repeat(40));
  console.log('端点\t\t\t总耗时\t平均\t最大\t错误');
  console.log('-'.repeat(60));
  for (const r of results) {
    console.log(`${r.endpoint}\t\t${r.total}ms\t${r.avg.toFixed(0)}ms\t${r.max}ms\t${r.errors}`);
  }
  
  const totalErrors = results.reduce((a, r) => a + r.errors + r.failed, 0);
  console.log(`\n总错误数: ${totalErrors}`);
  console.log(totalErrors === 0 ? '✓ 全部通过' : '✗ 存在错误');
}

main().catch(console.error);
