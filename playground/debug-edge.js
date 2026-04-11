import WebSocket from 'ws';

// Edge DevTools Protocol WebSocket URL
const WS_URL = 'ws://localhost:9222/devtools/page/6C2937C3B441BF915CEDFD01488D95CF';

async function debug() {
  console.log('🔍 连接到 Edge DevTools...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ WebSocket 连接成功\n');

    // 启用 Runtime
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.enable',
      params: {}
    }));

    // 执行调试命令
    setTimeout(() => {
      console.log('📊 检查项目状态...\n');

      // 检查 projectStore
      ws.send(JSON.stringify({
        id: 2,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            console.log('=== 项目调试信息 ===');
            console.log('项目列表:', window.projectStore?.projects?.value);
            console.log('当前项目:', window.projectStore?.currentProject?.value);
            console.log('加载状态:', window.projectStore?.loading?.value);
            console.log('错误信息:', window.projectStore?.error?.value);
            JSON.stringify({
              projectsCount: window.projectStore?.projects?.value?.length,
              currentProject: window.projectStore?.currentProject?.value?.title,
              loading: window.projectStore?.loading?.value,
              error: window.projectStore?.error?.value
            });
          `,
          returnByValue: true
        }
      }));
    }, 500);

    // 检查 IndexedDB
    setTimeout(() => {
      console.log('\n📦 检查 IndexedDB...\n');

      ws.send(JSON.stringify({
        id: 3,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            (async () => {
              return new Promise((resolve) => {
                const request = indexedDB.open('AI_Novel_Workshop', 1);
                request.onsuccess = (event) => {
                  const db = event.target.result;
                  const transaction = db.transaction(['projects'], 'readonly');
                  const store = transaction.objectStore('projects');

                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => {
                    const projects = getAllRequest.result;
                    console.log('=== IndexedDB 中的项目 ===', projects);

                    resolve(JSON.stringify({
                      count: projects.length,
                      projects: projects.map(p => ({
                        id: p.id,
                        title: p.title,
                        hasWorld: !!p.world,
                        hasCharacters: !!(p.characters && p.characters.length)
                      }))
                    }));
                  };
                };
              });
            })();
          `,
          returnByValue: true,
          awaitPromise: true
        }
      }));
    }, 1000);

    // 检查特定项目
    setTimeout(() => {
      console.log('\n🎯 检查目标项目...\n');

      ws.send(JSON.stringify({
        id: 4,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            (async () => {
              return new Promise((resolve) => {
                const request = indexedDB.open('AI_Novel_Workshop', 1);
                request.onsuccess = (event) => {
                  const db = event.target.result;
                  const transaction = db.transaction(['projects'], 'readonly');
                  const store = transaction.objectStore('projects');

                  const getRequest = store.get('3774e929-c917-4992-87f0-0a78f87fa662');
                  getRequest.onsuccess = () => {
                    const project = getRequest.result;
                    console.log('=== 目标项目详细数据 ===', project);
                    resolve(JSON.stringify(project || { error: '项目不存在' }, null, 2));
                  };
                };
              });
            })();
          `,
          returnByValue: true,
          awaitPromise: true
        }
      }));
    }, 1500);

    // 关闭连接
    setTimeout(() => {
      console.log('\n✅ 调试完成');
      ws.close();
    }, 2000);
  });

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      if (response.id === 2) {
        console.log('项目状态:', response.result?.result?.value || '无数据');
      } else if (response.id === 3) {
        const result = JSON.parse(response.result?.result?.value || '{}');
        console.log(`找到 ${result.count} 个项目:`);
        result.projects?.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.title} (${p.id})`);
          console.log(`     - 世界观: ${p.hasWorld ? '✅' : '❌'}`);
          console.log(`     - 人物: ${p.hasCharacters ? '✅' : '❌'}`);
        });
      } else if (response.id === 4) {
        const project = JSON.parse(response.result?.result?.value || '{}');
        console.log('目标项目数据:');
        console.log(project);
      }
    } catch (error) {
      // 忽略解析错误
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error.message);
  });

  ws.on('close', () => {
    console.log('连接已关闭');
  });
}

debug().catch(console.error);
