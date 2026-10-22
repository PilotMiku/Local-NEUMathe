#!/bin/zsh
cd "${0:A:h}"
/usr/bin/python3 scripts/local_service.py start
if [[ $? -ne 0 ]]; then
  read '?启动失败，按回车键退出'
fi
