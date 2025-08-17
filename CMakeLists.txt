cmake_minimum_required(VERSION 3.30)
project(database_lib C CXX)

# --------------------------
# C / C++ 标准
# --------------------------
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --------------------------
# 数据库库源文件
# --------------------------
set(DB_SRC
    src/database.c
    src/sqlite_db.c
    src/unqlite_db.c
    src/kv_db.c
    packages/sqlite/sqlite3.c
    crates/unqlite/unqlite.c
)

# --------------------------
# 生成静态库 database_lib
# --------------------------
add_library(database_lib STATIC ${DB_SRC})

target_include_directories(database_lib PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/packages/sqlite
    ${CMAKE_CURRENT_SOURCE_DIR}/crates/unqlite   # 确保先包含
    ${CMAKE_CURRENT_SOURCE_DIR}/crates/klib
    ${CMAKE_CURRENT_SOURCE_DIR}/crates/dirent/include
)

# 线程库
find_package(Threads REQUIRED)
target_link_libraries(database_lib PUBLIC Threads::Threads)

# Windows 系统必须链接 ws2_32
if (WIN32)
    target_link_libraries(database_lib PUBLIC ws2_32)
endif()

# --------------------------
# 示例主程序
# --------------------------
add_executable(database_demo src/main.c)
target_link_libraries(database_demo PRIVATE database_lib Threads::Threads)
if(WIN32)
    target_link_libraries(database_demo PRIVATE ws2_32)
endif()

# --------------------------
# gtest 测试
# --------------------------
enable_testing()
add_subdirectory(crates/googletest)

file(GLOB TEST_FILES "${CMAKE_CURRENT_SOURCE_DIR}/tests/*.cpp")
if(NOT TEST_FILES)
    message(FATAL_ERROR "No test files found in ${CMAKE_CURRENT_SOURCE_DIR}/tests")
endif()

add_executable(run_tests ${TEST_FILES})
target_include_directories(run_tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_link_libraries(run_tests PRIVATE
    database_lib
    gtest
    gtest_main
    Threads::Threads
)
if (WIN32)
    target_link_libraries(run_tests PRIVATE ws2_32)
endif()

# 自动发现 gtest 测试
include(GoogleTest)
gtest_discover_tests(run_tests)
