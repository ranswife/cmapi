#!/bin/bash
# Class Memories API 测试脚本
# 测试所有主要 API 端点

BASE_URL="https://api.classmemories.org/v1"
INVITE_CODE="OUR-MEMORIES-2024"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 计数器
PASSED=0
FAILED=0

# 生成随机用户名
RANDOM_SUFFIX=$(date +%s)
TEST_USERNAME="testuser_${RANDOM_SUFFIX}"
TEST_PASSWORD="TestPass123!"
TEST_NICKNAME="测试用户"

# 存储 token
REFRESH_TOKEN=""
ACCESS_TOKEN=""
POST_ID=""
IMAGE_ID=""

log_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    echo -e "  Response: $2"
    ((FAILED++))
}

log_info() {
    echo -e "${YELLOW}→${NC} $1"
}

# 检查 JSON 响应中 success 字段
check_success() {
    local response="$1"
    local test_name="$2"
    
    if echo "$response" | grep -q '"success":true'; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name" "$response"
        return 1
    fi
}

# 检查 HTTP 状态码
check_status() {
    local status="$1"
    local expected="$2"
    local test_name="$3"
    local response="$4"
    
    if [ "$status" -eq "$expected" ]; then
        log_pass "$test_name (HTTP $status)"
        return 0
    else
        log_fail "$test_name (expected $expected, got $status)" "$response"
        return 1
    fi
}

echo "============================================"
echo "    Class Memories API 测试"
echo "    Base URL: $BASE_URL"
echo "============================================"
echo ""

# ========== 1. 账户模块 ==========
echo "========== 1. 账户模块 =========="

# 1.1 注册
log_info "注册新用户: $TEST_USERNAME"
RESPONSE=$(curl -s -X POST "$BASE_URL/signup" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\",\"nickname\":\"$TEST_NICKNAME\",\"inviteCode\":\"$INVITE_CODE\"}")
check_success "$RESPONSE" "用户注册"

# 1.2 重复注册应该失败
log_info "测试重复注册"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/signup" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\",\"nickname\":\"$TEST_NICKNAME\",\"inviteCode\":\"$INVITE_CODE\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
check_status "$HTTP_CODE" 409 "重复注册返回 409" "$BODY"

# 1.3 登录
log_info "用户登录"
RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}")
if check_success "$RESPONSE" "用户登录"; then
    REFRESH_TOKEN=$(echo "$RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
    log_info "获取到 Refresh Token: ${REFRESH_TOKEN:0:20}..."
fi

# 1.4 刷新 Token
log_info "刷新 Access Token"
RESPONSE=$(curl -s -X POST "$BASE_URL/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
if check_success "$RESPONSE" "刷新 Token"; then
    ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    log_info "获取到 Access Token: ${ACCESS_TOKEN:0:20}..."
fi

# 1.5 获取个人资料 (me)
log_info "获取个人资料 (me)"
RESPONSE=$(curl -s -X GET "$BASE_URL/profile/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "获取个人资料"

# 1.6 无 Token 访问应该失败
log_info "测试无 Token 访问"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/profile/me")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_status "$HTTP_CODE" 401 "无 Token 返回 401"

echo ""

# ========== 2. TOTP 模块 ==========
echo "========== 2. TOTP 模块 =========="

# 2.1 获取 TOTP 状态
log_info "获取 TOTP 状态"
RESPONSE=$(curl -s -X GET "$BASE_URL/totp/status" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "获取 TOTP 状态"; then
    if echo "$RESPONSE" | grep -q '"enabled":false'; then
        log_pass "TOTP 默认未启用"
    fi
fi

# 2.2 生成 TOTP Secret
log_info "生成 TOTP Secret"
RESPONSE=$(curl -s -X POST "$BASE_URL/totp/setup" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "生成 TOTP Secret"; then
    if echo "$RESPONSE" | grep -q '"secret":"'; then
        log_pass "返回了 TOTP Secret"
    fi
    if echo "$RESPONSE" | grep -q '"uri":"otpauth://'; then
        log_pass "返回了 otpauth URI"
    fi
fi

# 注意: 不测试 enable/disable，因为需要真实的 TOTP 码

echo ""

# ========== 3. 帖子模块 ==========
echo "========== 3. 帖子模块 =========="

# 3.1 创建帖子
log_info "创建帖子"
RESPONSE=$(curl -s -X POST "$BASE_URL/posts" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"content":"这是一条测试帖子 🎉","images":[]}')
if check_success "$RESPONSE" "创建帖子"; then
    POST_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log_info "创建的帖子 ID: $POST_ID"
fi

# 3.2 获取帖子详情
log_info "获取帖子详情"
RESPONSE=$(curl -s -X GET "$BASE_URL/posts/$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "获取帖子详情"; then
    if echo "$RESPONSE" | grep -q '这是一条测试帖子'; then
        log_pass "帖子内容正确"
    fi
fi

# 3.3 获取帖子流
log_info "获取帖子流"
RESPONSE=$(curl -s -X GET "$BASE_URL/posts?page=1&limit=10" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "获取帖子流"

# 3.4 创建回复
log_info "创建帖子回复"
RESPONSE=$(curl -s -X POST "$BASE_URL/posts" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"这是一条回复\",\"parentId\":\"$POST_ID\",\"parentType\":\"post\"}")
if check_success "$RESPONSE" "创建帖子回复"; then
    REPLY_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log_info "回复 ID: $REPLY_ID"
fi

# 3.5 获取帖子回复
log_info "获取帖子回复"
RESPONSE=$(curl -s -X GET "$BASE_URL/posts/$POST_ID/replies" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "获取帖子回复"; then
    if echo "$RESPONSE" | grep -q '这是一条回复'; then
        log_pass "回复内容正确"
    fi
fi

# 3.6 回复不存在的帖子应该失败
log_info "测试回复不存在的帖子"
FAKE_UUID="00000000-0000-0000-0000-000000000000"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/posts" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"test\",\"parentId\":\"$FAKE_UUID\",\"parentType\":\"post\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_status "$HTTP_CODE" 404 "回复不存在帖子返回 404"

echo ""

# ========== 4. 点赞模块 ==========
echo "========== 4. 点赞模块 =========="

# 4.1 点赞帖子
log_info "点赞帖子"
RESPONSE=$(curl -s -X PUT "$BASE_URL/likes/post/$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "点赞帖子"; then
    if echo "$RESPONSE" | grep -q '"liked":true'; then
        log_pass "点赞状态正确"
    fi
fi

# 4.2 重复点赞（幂等）
log_info "重复点赞（幂等测试）"
RESPONSE=$(curl -s -X PUT "$BASE_URL/likes/post/$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "重复点赞成功"

# 4.3 获取点赞状态
log_info "获取点赞状态"
RESPONSE=$(curl -s -X GET "$BASE_URL/likes/status?targetType=post&targetIds=$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "获取点赞状态"; then
    if echo "$RESPONSE" | grep -q '"isLiked":true'; then
        log_pass "点赞状态为 true"
    fi
    if echo "$RESPONSE" | grep -q '"count":1'; then
        log_pass "点赞数为 1"
    fi
fi

# 4.4 取消点赞
log_info "取消点赞"
RESPONSE=$(curl -s -X DELETE "$BASE_URL/likes/post/$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "取消点赞"; then
    if echo "$RESPONSE" | grep -q '"liked":false'; then
        log_pass "取消点赞状态正确"
    fi
fi

# 4.5 点赞不存在的帖子应该失败
log_info "测试点赞不存在的帖子"
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/likes/post/$FAKE_UUID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_status "$HTTP_CODE" 404 "点赞不存在帖子返回 404"

echo ""

# ========== 5. 图片模块 ==========
echo "========== 5. 图片模块 =========="

# 5.1 上传图片（获取预签名 URL）
log_info "请求图片上传 URL"
RESPONSE=$(curl -s -X POST "$BASE_URL/images" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"originalExt":".jpg","createdAt":"2024-01-01"}')
if check_success "$RESPONSE" "请求图片上传 URL"; then
    IMAGE_ID=$(echo "$RESPONSE" | grep -o '"imageId":"[^"]*"' | cut -d'"' -f4)
    log_info "图片 ID: $IMAGE_ID"
    if echo "$RESPONSE" | grep -q '"preview":"https://'; then
        log_pass "返回了预览图上传 URL"
    fi
    if echo "$RESPONSE" | grep -q '"original":"https://'; then
        log_pass "返回了原图上传 URL"
    fi
fi

# 5.2 获取图片列表
log_info "获取图片列表"
RESPONSE=$(curl -s -X GET "$BASE_URL/images?page=1&limit=10" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "获取图片列表"

# 5.3 获取时间轴
log_info "获取时间轴"
RESPONSE=$(curl -s -X GET "$BASE_URL/images/timeline" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "获取时间轴"

# 5.4 创建图片回复
log_info "创建图片回复"
RESPONSE=$(curl -s -X POST "$BASE_URL/posts" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"这张图片真好看！\",\"parentId\":\"$IMAGE_ID\",\"parentType\":\"image\"}")
check_success "$RESPONSE" "创建图片回复"

# 5.5 获取图片回复
log_info "获取图片回复"
RESPONSE=$(curl -s -X GET "$BASE_URL/images/$IMAGE_ID/replies" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if check_success "$RESPONSE" "获取图片回复"; then
    if echo "$RESPONSE" | grep -q '这张图片真好看'; then
        log_pass "图片回复内容正确"
    fi
fi

echo ""

# ========== 6. 清理 & 权限测试 ==========
echo "========== 6. 清理 & 权限测试 =========="

# 6.1 删除回复
log_info "删除回复"
RESPONSE=$(curl -s -X DELETE "$BASE_URL/posts/$REPLY_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "删除回复"

# 6.2 删除帖子
log_info "删除帖子"
RESPONSE=$(curl -s -X DELETE "$BASE_URL/posts/$POST_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "删除帖子"

# 6.3 删除不存在的帖子应该返回 404
log_info "测试删除不存在的帖子"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/posts/$FAKE_UUID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_status "$HTTP_CODE" 404 "删除不存在帖子返回 404"

# 6.4 删除图片
log_info "删除图片"
RESPONSE=$(curl -s -X DELETE "$BASE_URL/images/$IMAGE_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
check_success "$RESPONSE" "删除图片"

# 6.5 登出
log_info "用户登出"
RESPONSE=$(curl -s -X POST "$BASE_URL/logout" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
check_success "$RESPONSE" "用户登出"

# 6.6 登出后 Refresh Token 应该无效
log_info "测试登出后 Token 失效"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
check_status "$HTTP_CODE" 401 "登出后 Token 失效返回 401"

echo ""
echo "============================================"
echo "    测试完成"
echo "============================================"
echo -e "  ${GREEN}通过${NC}: $PASSED"
echo -e "  ${RED}失败${NC}: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
fi
