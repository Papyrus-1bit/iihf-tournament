from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def test_home_loads(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 15)
    hero = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-hero']"))
    )
    assert hero.is_displayed()


def test_open_new_tournament_modal(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 15)
    button = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[aria-label='Новый турнир']"))
    )
    button.click()
    modal = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    assert modal.is_displayed()


def test_select_team_updates_summary(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 20)
    summary_name = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='team-summary-name']"))
    )
    initial_name = summary_name.text
    rating_rows = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "[data-testid^='rating-row-']"))
    )
    if len(rating_rows) < 2:
        return
    rating_rows[1].click()
    wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid='team-summary-name']").text
        != initial_name
    )


def test_selected_team_persists_after_reload(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 20)
    summary_name = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='team-summary-name']"))
    )
    initial_name = summary_name.text
    rating_rows = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "[data-testid^='rating-row-']"))
    )
    if len(rating_rows) < 2:
        return
    rating_rows[1].click()
    wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid='team-summary-name']").text
        != initial_name
    )
    selected_name = wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid='team-summary-name']").text
    )
    driver.refresh()
    wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid='team-summary-name']").text
        == selected_name
    )


def test_create_tournament_and_enter_score(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 20)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-hero']")))
    new_tournament = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[aria-label='Новый турнир']"))
    )
    new_tournament.click()
    modal = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    assert modal.is_displayed()

    # Wait for create tournament button to appear and click it
    create_button = wait.until(
        EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Создать турнир')]"))
    )
    create_button.click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']")))

    # Calendar should appear
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".calendar-strip")))

    # Enter a score in the first visible match inputs
    score_inputs = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".match-score-input"))
    )
    if len(score_inputs) >= 2:
        score_inputs[0].click()
        score_inputs[0].clear()
        score_inputs[0].send_keys("3")
        score_inputs[1].click()
        score_inputs[1].clear()
        score_inputs[1].send_keys("1")
        # Verify input values updated
        assert score_inputs[0].get_attribute("value") == "3"
        assert score_inputs[1].get_attribute("value") == "1"
